import { supabase } from '../supabaseClient';

export interface SentinelDirective {
  id?: string;
  source: string; // 'AI_ROUTINE' | 'AI_SYSTEMIC' | 'ADMIN_OVERRIDE'
  basis: string; // The data reasoning (e.g. "4 incidents, avg speed 10km/h")
  directive: string; // The human-readable message to drivers/commuters
  tier: 1 | 2; // 1 = auto, 2 = requires admin
  status: 'pending_admin' | 'broadcasted' | 'rejected';
  target_role: 'all' | 'operator' | 'commuter';
  created_at?: string;
}

/**
 * Sentinel Brain
 * Analyzes traffic & bookings -> generates Directives.
 * Tier 1: Routine tips (Broadcasted instantly)
 * Tier 2: Systemic changes (Sent to Admin Inbox)
 */
class SentinelBrainService {
  private isScanning = false;
  private scanInterval: any = null;

  async startMonitoring() {
    if (this.isScanning) return;
    this.isScanning = true;
    console.log('[SentinelBrain] Central Intelligence Online.');

    // In a real environment, this runs every 3-5 mins. 
    // We set to 60s for demo purposes to see actions faster.
    this.scanInterval = setInterval(() => {
      this.runIntelligenceScan();
      this.runSecurityScan();
    }, 60000);
    this.runIntelligenceScan(); 
    this.runSecurityScan();
  }

  stopMonitoring() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isScanning = false;
    console.log('[SentinelBrain] Offline.');
  }

  /**
   * The core AI Logic loop.
   */
  private async runIntelligenceScan() {
    try {
      console.log('[SentinelBrain] Scanning Grid Data...');

      // 1. Fetch recent incidents (Only from non-flagged users)
      const { data: incidents } = await supabase
        .from('incidents')
        .select('*, profiles!reporter_id(is_flagged)')
        .gte('created_at', new Date(Date.now() - 15 * 60000).toISOString());

      // Filter out flagged reports
      const validIncidents = incidents?.filter(inc => !(inc.profiles as any)?.is_flagged) || [];
      const incidentCount = validIncidents.length;

      // 2. Fetch active vehicles
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_available', true);

      const activeCount = vehicles?.length || 0;

      if (incidentCount === 0) {
        // Routine condition. Maybe issue a Tier 1 tip occasionally.
        if (Math.random() > 0.8) {
          await this.draftDirective({
            source: 'AI_ROUTINE',
            basis: 'Grid stable. High predicted demand at Nlongkak.',
            directive: 'Zone Nlongkak active. Positionnez-vous pour des courses rapides!',
            tier: 1,
            target_role: 'operator'
          });
        }
        return;
      }

      // If there are incidents, trigger Tier 2 (Systemic Anomaly)
      if (incidentCount >= 2) {
        await this.draftDirective({
          source: 'AI_SYSTEMIC',
          basis: `${incidentCount} incidents détectés. Potentiel blocage majeur.`,
          directive: 'ALERTE MAJEURE: Gros bouchon signalé. Évitez la zone C et utilisez les routes secondaires (Bastard/Nlongkak).',
          tier: 2, // Needs Admin Approval
          target_role: 'operator'
        });
      } else {
        // Minor incident -> Tier 1
        await this.draftDirective({
           source: 'AI_ROUTINE',
           basis: `1 incident signalé. Modif mineure de trafic.`,
           directive: '⚠️ Ralentissement mineur signalé. Restez vigilants.',
           tier: 1,
           target_role: 'operator'
        });
      }
    } catch (err) {
      console.error('[SentinelBrain] Scan failed', err);
    }
  }

  /**
   * Security Firewall Loop
   * Detects Sybil attacks and anomalous reporting patterns.
   */
  private async runSecurityScan() {
    try {
      console.log('[SentinelBrain] Running Security Protocol...');
      
      // 1. Get recent incident count per user
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60000).toISOString();
      const { data: reports } = await supabase
        .from('incidents')
        .select('reporter_id')
        .gte('created_at', fifteenMinsAgo);

      if (!reports) return;

      // 2. Count reports per user
      const reportCounts: Record<string, number> = {};
      reports.forEach(r => {
        if (!r.reporter_id) return;
        reportCounts[r.reporter_id] = (reportCounts[r.reporter_id] || 0) + 1;
      });

      // 3. Identify & Mute outliers (e.g., > 5 reports in 15 mins)
      for (const [userId, count] of Object.entries(reportCounts)) {
        if (count > 5) {
          console.warn(`[SentinelBrain] SECURITY ALERT: User ${userId} flagged for Flood Attack (${count} reports). Muting.`);
          await supabase.from('profiles').update({ is_flagged: true }).eq('id', userId);
          
          // Send silent alert to Admin
          await this.draftDirective({
            source: 'SECURITY_FIREWALL',
            basis: `User ${userId.substring(0, 8)} triggered flood protection.`,
            directive: `AI Firewall: Node shadow-banned due to anomalous reporting density.`,
            tier: 2,
            target_role: 'all'
          });
        }
      }
    } catch (err) {
      console.error('[SentinelBrain] Security scan failed', err);
    }
  }

  private async draftDirective(params: { source: string; basis: string; directive: string; tier: 1 | 2; target_role: string }) {
    // If Admin says "I just automate and intervene at wish",
    // We enforce: Tier 1 goes straight to broadcasted. Tier 2 goes to pending_admin.
    const status = params.tier === 1 ? 'broadcasted' : 'pending_admin';

    const payload = {
      source: params.source,
      basis: params.basis,
      directive: params.directive,
      tier: params.tier,
      status: status,
      target_role: params.target_role
    };

    console.log(`[SentinelBrain] Issuing Tier ${params.tier} Directive (Status: ${status}):`, payload.directive);

    // Save to DB
    const { error } = await supabase.from('sentinel_directives').insert([payload]);
    if (error) {
      console.error('[SentinelBrain] Failed to draft directive:', error);
    }
  }

  /**
   * The "Universal Broadcast" manual override for the admin.
   */
  async triggerManualOverride(directive: string, targetRole: 'all' | 'operator' | 'commuter') {
    const payload = {
      source: 'ADMIN_OVERRIDE',
      basis: 'Commandement Central AFAT',
      directive: directive,
      tier: 2,
      status: 'broadcasted', // Instantly goes live
      target_role: targetRole
    };

    const { error } = await supabase.from('sentinel_directives').insert([payload]);
    if (error) {
       console.error('[SentinelBrain] Manual Broadcast failed:', error);
       throw error;
    }
  }
}

export const sentinelBrain = new SentinelBrainService();
