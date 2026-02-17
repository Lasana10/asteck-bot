import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from './supabaseClient';
import { 
  MapPin, 
  AlertTriangle, 
  Navigation, 
  ShieldCheck, 
  Fuel, 
  Activity, 
  Bell,
  ChevronRight,
  TrendingDown,
  ExternalLink
} from 'lucide-react';

// Leaflet marker fix
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Types
interface Incident {
  id: string;
  type: string;
  severity: number;
  description: string;
  latitude: number;
  longitude: number;
  reporter_username: string;
  status: string;
  confirmations: number;
  created_at: string;
}

const INCIDENT_LABELS: Record<string, string> = {
  accident: 'Accident',
  police_control: 'Police Checkpoint',
  flooding: 'Flooding',
  traffic_jam: 'Traffic Jam',
  road_damage: 'Road Damage',
  road_works: 'Road Works',
  hazard: 'Hazard',
  protest: 'Demonstration',
  roadblock: 'Roadblock',
  sos: 'Emergency SOS',
  other: 'Other Incident'
};

const INCIDENT_EMOJIS: Record<string, string> = {
  accident: '💥',
  police_control: '👮',
  flooding: '🌊',
  traffic_jam: '🚗',
  road_damage: '🕳️',
  road_works: '🚧',
  hazard: '⚠️',
  protest: '📢',
  roadblock: '🚧',
  sos: '🆘',
  other: '📍'
};

const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

const Dashboard: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([3.8480, 11.5021]); // Yaoundé default

  useEffect(() => {
    fetchIncidents();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('public:incidents')
      .on('postgres_changes', { event: '*', table: 'incidents' }, (payload) => {
        console.log('Real-time update:', payload);
        fetchIncidents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchIncidents = async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setIncidents(data);
    }
    setLoading(false);
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 4) return 'text-asteck-error';
    if (severity >= 3) return 'text-asteck-accent';
    return 'text-asteck-safe';
  };

  return (
    <div className="flex flex-col h-screen bg-asteck-dark text-gray-100 overflow-hidden">
      {/* Top Header */}
      <header className="h-16 flex items-center justify-between px-8 glass-panel z-[1000] border-b border-white/5">
        <div className="flex items-center space-x-3">
          <div className="bg-asteck-accent p-2 rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <Activity className="text-asteck-dark w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter">ASTECK</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Command Center v1.2</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="hidden md:flex items-center space-x-2 text-sm text-green-400">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            <span>Secure Satellite Link: Online</span>
          </div>
          <div className="flex items-center space-x-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
             <TrendingDown className="text-green-400 w-4 h-4" />
             <span className="text-xs font-medium">Urban Flow: Optimized</span>
          </div>
          <Bell className="w-5 h-5 text-gray-400 cursor-pointer hover:text-white transition-colors" />
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar - Incident Feed */}
        <aside className="w-96 flex flex-col glass-panel m-4 rounded-2xl overflow-hidden border border-white/5 z-[999] shadow-2xl">
          <div className="p-6 border-b border-white/5 bg-white/5">
            <div className="flex justify-between items-center mb-1">
               <h2 className="text-lg font-bold flex items-center space-x-2">
                <ShieldCheck className="text-asteck-safe w-5 h-5" />
                <span>Verified Intelligence</span>
              </h2>
              <span className="bg-asteck-safe/20 text-asteck-safe text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Live</span>
            </div>
            <p className="text-xs text-gray-400">Real-time reports from official sources</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-asteck-accent" />
                <span className="text-xs text-gray-500 animate-pulse">Synchronizing Data...</span>
              </div>
            ) : incidents.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No active incidents detected</p>
                <p className="text-[10px] mt-2 italic text-gray-600">Surveillance active across 10 regions</p>
              </div>
            ) : (
              incidents.map((incident) => (
                <div 
                  key={incident.id} 
                  onClick={() => setMapCenter([incident.latitude, incident.longitude])}
                  className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer border border-white/5 group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ExternalLink className="w-3 h-3 text-gray-500" />
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${getSeverityColor(incident.severity)} bg-white/5`}>
                      Tier {incident.severity}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm mb-1 flex items-center space-x-2">
                    <span>{INCIDENT_EMOJIS[incident.type] || '📍'}</span>
                    <span>{INCIDENT_LABELS[incident.type] || incident.type}</span>
                  </h3>
                  <p className="text-xs text-gray-400 line-clamp-2 mb-3 leading-relaxed">
                    {incident.description}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center space-x-2 text-[10px] text-gray-500">
                      <ShieldCheck className="w-3 h-3 text-asteck-safe" />
                      <span className="font-semibold">{incident.confirmations} Verified Units</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Global Map View */}
        <div className="flex-1 m-4 ml-0 rounded-2xl overflow-hidden border border-white/5 shadow-inner relative">
          <MapContainer 
            center={mapCenter} 
            zoom={13} 
            className="w-full h-full z-0 grayscale-[0.8] invert-[0.9] opacity-90"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapUpdater center={mapCenter} />
            {incidents.map((incident) => (
              <Marker key={incident.id} position={[incident.latitude, incident.longitude]}>
                <Popup>
                  <div className="p-2 min-w-[150px] bg-asteck-dark text-white rounded-lg">
                    <h4 className="font-bold text-asteck-accent mb-1">{INCIDENT_LABELS[incident.type] || incident.type}</h4>
                    <p className="text-xs opacity-80">{incident.description}</p>
                    <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-[10px]">
                      <span>By @{incident.reporter_username}</span>
                      <span className="text-asteck-safe font-bold">{incident.confirmations} OK</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Overlays */}
          <div className="absolute top-6 left-6 p-4 glass-panel rounded-xl z-[999] pointer-events-none">
            <div className="flex items-center space-x-3">
              <Navigation className="text-asteck-safe w-6 h-6 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold tracking-tight">Driver Guidance HUD</h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Corridors Operational</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-10 inset-x-0 flex justify-center z-[999] px-6 pointer-events-none">
             <div className="pointer-events-auto glass-panel px-6 py-3 rounded-2xl flex items-center space-x-8 border border-white/10 shadow-2xl">
                <div className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-asteck-safe rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                  <span className="text-xs font-bold tracking-tight uppercase">Safe Pass</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center space-x-2">
                  <Activity className="text-asteck-accent w-4 h-4" />
                  <span className="text-xs font-bold tracking-tight uppercase">Proactive Scan: Yaoundé V</span>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center space-x-2">
                  <TrendingDown className="text-green-400 w-4 h-4" />
                  <span className="text-xs font-bold tracking-tight uppercase">Congestion: -12%</span>
                </div>
             </div>
          </div>
          
          {/* Right Bottom Legend */}
          <div className="absolute bottom-6 right-6 p-4 glass-panel rounded-xl z-[999] text-[10px] uppercase font-bold tracking-widest text-gray-500 border border-white/5 space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-asteck-error" />
              <span>Critical (S-5)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-asteck-accent" />
              <span>Moderate (S-3)</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
