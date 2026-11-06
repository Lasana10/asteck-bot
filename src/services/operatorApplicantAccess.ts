import {supabase} from '../infra/supabase';

/** Authoritative server-side access application prerequisite for preliminary
 * vehicle evidence. This does NOT grant operator capability, vehicle clearance,
 * dispatch access or a publishable departure.
 */
export async function hasPendingOperatorApplication(profileId:string):Promise<boolean>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId))return false;
 const {data,error}=await supabase.from('access_applications').select('id')
   .eq('profile_id',profileId).eq('capability_key','operator')
   .in('status',['submitted','under_review','needs_information'])
   .limit(1).maybeSingle();
 if(error)throw error;
 return Boolean(data?.id);
}
