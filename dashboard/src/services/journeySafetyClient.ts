import { supabase } from '../supabaseClient';

export async function evaluateJourneySafety(assignmentId: string) {
  const { data, error } = await supabase.rpc('afat_evaluate_journey_safety', { p_assignment_id: assignmentId });
  return { data, error };
}

export async function fetchJourneySafetySignals(assignmentId: string) {
  const { data, error } = await supabase
    .from('afat_safety_signals')
    .select('id,signal_type,severity,status,detected_at,resolved_at,evidence')
    .eq('dispatch_assignment_id', assignmentId)
    .in('status', ['open','acknowledged'])
    .order('detected_at', { ascending: false });
  return { data: data || [], error };
}
