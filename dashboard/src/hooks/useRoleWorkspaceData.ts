import { useEffect, useState } from 'react';
import {
  fetchActiveDispatches,
  fetchAccessApprovalInbox,
  fetchComplianceRadar,
  fetchDemandRadar,
  fetchLiveMapOps,
  fetchMobilityMapFeed,
  fetchOpsReportCenter,
  fetchParticipantDispatches,
  fetchPaymentProviderReadiness,
  fetchPassageIntents,
  fetchPublicPartnerConditions,
} from '../supabaseClient';

export type RoleWorkspaceKey = 'commuter' | 'operator' | 'organization' | 'government' | 'planner' | 'admin';
export type RoleWorkspaceLiveFeed = { incidents: any[]; tracks: any[]; checkpoints: any[]; atlasNodes: any[]; atlasEdges: any[] };

const EMPTY_LIVE: RoleWorkspaceLiveFeed = { incidents: [], tracks: [], checkpoints: [], atlasNodes: [], atlasEdges: [] };

export function useRoleWorkspaceData(role: RoleWorkspaceKey, profile: any) {
  const [live, setLive] = useState<RoleWorkspaceLiveFeed>(EMPTY_LIVE);
  const [missions, setMissions] = useState<any[]>([]);
  const [operations, setOperations] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [serviceErrors, setServiceErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      setLoading(true);
      const errors: string[] = [];
      const city = profile?.preferred_city || profile?.base_city || 'cameroon';

      try {
        const mapResult = role === 'government'
          ? await fetchPublicPartnerConditions(city)
          : ['planner', 'admin'].includes(role)
            ? await fetchLiveMapOps(city)
            : await fetchMobilityMapFeed(city);

        if (!active) return;

        if (mapResult.data) {
          setLive({
            incidents: mapResult.data.incidents || [],
            tracks: mapResult.data.vehicles || [],
            checkpoints: mapResult.data.checkpoints || mapResult.data.addresses || [],
            atlasNodes: mapResult.data.atlas_nodes || [],
            atlasEdges: mapResult.data.atlas_edges || [],
          });
        }
        if (mapResult.error) errors.push(`Map services: ${mapResult.error.message}`);

        if (role === 'commuter' || role === 'operator') {
          const participantDispatches = await fetchParticipantDispatches({ include_terminal: true, limit: 20 });
          if (participantDispatches.error) errors.push(`Journey continuity: ${participantDispatches.error.message}`);
          if (active) {
            setOperations((current: any) => ({
              ...current,
              participantDispatches: participantDispatches.data?.dispatches || [],
            }));
          }
        }

        if (role === 'operator') {
          const requests = await fetchPassageIntents({ status: 'requested' });
          if (active) setMissions(requests.data?.passages || []);
          if (requests.error) errors.push(`Mission queue: ${requests.error.message}`);
        }

        if (role === 'planner') {
          const [demand, dispatches] = await Promise.all([
            fetchDemandRadar(),
            fetchActiveDispatches(),
          ]);
          if (active) setOperations({
            demand: demand.data,
            dispatches: dispatches.data?.dispatches || [],
          });
          if (demand.error) errors.push(`Demand radar: ${demand.error.message}`);
          if (dispatches.error) errors.push(`Dispatch board: ${dispatches.error.message}`);
        }

        if (role === 'admin') {
          const [reports, compliance, approvals, payments] = await Promise.all([
            fetchOpsReportCenter(),
            fetchComplianceRadar(),
            fetchAccessApprovalInbox(),
            fetchPaymentProviderReadiness(),
          ]);
          if (active) setOperations({
            reports: reports.data,
            compliance: compliance.data,
            accessApplications: approvals.data?.applications || [],
            paymentReadiness: payments.data || null,
          });
          if (reports.error) errors.push(`Reports: ${reports.error.message}`);
          if (compliance.error) errors.push(`Compliance: ${compliance.error.message}`);
          if (approvals.error) errors.push(`Access reviews: ${approvals.error.message}`);
          if (payments.error) errors.push(`Payments: ${payments.error.message}`);
        }
      } catch (error: any) {
        errors.push(error?.message || 'AFAT live services could not be refreshed.');
      }

      if (active) {
        setServiceErrors(errors);
        setLoading(false);
      }
    };

    void hydrate();
    return () => {
      active = false;
    };
  }, [role, profile?.id, profile?.preferred_city, profile?.base_city, refreshKey]);

  return {
    live,
    missions,
    operations,
    loading,
    serviceErrors,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
