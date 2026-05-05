import { supabase } from '../infra/supabase';
import { GpsTrack, Anomaly } from '../types';

/**
 * MobilityOS Intelligence Grid Service
 * Processes passive GPS data to detect traffic patterns and safety anomalies.
 */
export const intelligenceGrid = {
  /**
   * Detects traffic jams based on speed clusters.
   * Logic: If multiple users in the same area have speed < 5kph, it's a jam.
   */
  async detectTrafficAnomalies(): Promise<Anomaly[]> {
    const { data: tracks, error } = await supabase
      .from('gps_tracks')
      .select('*')
      .gt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()); // Last 15 mins

    if (error || !tracks) return [];

    const anomalies: Anomaly[] = [];
    
    // Group tracks by approximate coordinate (gridding)
    const grid: Record<string, any[]> = {};
    tracks.forEach(t => {
      // Extract lat/lng from POINT(lng lat)
      const matches = t.location.match(/\((.*) (.*)\)/);
      if (!matches) return;
      const lng = parseFloat(matches[1]);
      const lat = parseFloat(matches[2]);
      
      const key = `${lat.toFixed(3)}|${lng.toFixed(3)}`;
      if (!grid[key]) grid[key] = [];
      grid[key].push({ ...t, lat, lng });
    });

    for (const [key, cluster] of Object.entries(grid)) {
      const avgSpeed = cluster.reduce((sum, t) => sum + (t.speed_kph || 0), 0) / cluster.length;
      const [lat, lng] = key.split('|').map(parseFloat);

      if (cluster.length >= 3 && avgSpeed < 5) {
        anomalies.push({
          type: 'traffic_jam',
          latitude: lat,
          longitude: lng,
          intensity: Math.min(cluster.length / 10, 1),
          description: `Congestion detected via Grid: ${cluster.length} vehicles moving at ${avgSpeed.toFixed(1)} km/h`,
          createdAt: new Date()
        });
      }

      // Detect overspeeding (e.g. > 100kph in city)
      const speeders = cluster.filter(t => (t.speed_kph || 0) > 100);
      if (speeders.length > 0) {
        anomalies.push({
          type: 'overspeeding',
          latitude: lat,
          longitude: lng,
          intensity: speeders.length / cluster.length,
          description: `Overspeeding alert: ${speeders.length} vehicles detected at high speed.`,
          createdAt: new Date()
        });
      }
    }

    return anomalies;
  },

  /**
   * Broadcasts detected anomalies back to the intelligence grid (incidents table).
   */
  async broadcastAnomalies() {
    const anomalies = await this.detectTrafficAnomalies();
    for (const anomaly of anomalies) {
      // Avoid duplicates: check if an incident exists nearby in the last hour
      const { data: existing } = await supabase
        .from('incidents')
        .select('id')
        .eq('type', 'traffic_jam')
        .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('incidents').insert({
          type: anomaly.type === 'traffic_jam' ? 'traffic_jam' : 'accident',
          description: anomaly.description,
          latitude: anomaly.latitude,
          longitude: anomaly.longitude,
          severity: Math.ceil(anomaly.intensity * 5),
          source: 'passive_grid',
          status: 'verified',
          reporter_username: 'GRID_AI'
        });
      }
    }
  }
};
