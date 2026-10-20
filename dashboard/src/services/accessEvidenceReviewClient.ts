import { supabase } from '../supabaseClient';

export type PendingAccessEvidence = {
  id: string;
  place_id: string;
  profile_id: string;
  suggested_access_type: string;
  name: string | null;
  instructions: string | null;
  latitude: number;
  longitude: number;
  gps_accuracy_m: number | null;
  access_modes: string[] | null;
  photo_url: string | null;
  created_at: string;
  status: 'pending' | 'accepted' | 'rejected';
};

const publicReviewColumns = 'id,place_id,profile_id,suggested_access_type,name,instructions,latitude,longitude,gps_accuracy_m,access_modes,photo_url,created_at,status';

export async function listPendingAccessEvidence(limit=30): Promise<PendingAccessEvidence[]> {
  const { data, error } = await supabase.from('afat_access_evidence_submissions')
    .select(publicReviewColumns)
    .eq('status','pending')
    .order('created_at',{ascending:true})
    .limit(Math.min(80,Math.max(1,Math.round(limit))));
  if (error) throw new Error(error.message || 'Pending access evidence is unavailable for this reviewer.');
  return (data || []) as unknown as PendingAccessEvidence[];
}

/** The existing privileged RPC verifies map.evidence.review before promoting
 * a submission to limited-evidence access. It cannot make a route passable.
 */
export async function decideAccessEvidence(id:string,decision:'accept'|'reject') {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('A valid evidence ID is required.');
  const {data,error}=await supabase.rpc('afat_review_access_evidence',{
    p_submission_id:id,
    p_decision:decision,
  });
  if(error) throw new Error(error.message || 'Evidence review failed.');
  if(data?.status !== (decision === 'accept'?'accepted':'rejected'))
    throw new Error('Evidence was not confirmed in the requested state.');
  return data as {id:string;status:'accepted'|'rejected';access_point_id?:string;evidence_status?:string;automatic_truth?:boolean};
}

export function accessAccuracyLabel(accuracy:number|null):string {
  if (accuracy===null || !Number.isFinite(accuracy)) return 'Accuracy not supplied';
  if(accuracy > 120) return 'Uncertain GPS';
  return `GPS ±${Math.round(accuracy)} m`;
}
