# AFAT Supabase — verified project identity (2026-10-19)

**Project name:** TRAFFIC  
**Project ref:** `rkijcxxryhfrqsgkwtbu`  
**Dashboard:** https://supabase.com/dashboard/project/rkijcxxryhfrqsgkwtbu  
**API host:** https://rkijcxxryhfrqsgkwtbu.supabase.co  
**Region:** eu-west-1  
**Status observed:** ACTIVE_HEALTHY

This identity was verified using the user's connected Supabase account and confirmed by querying AFAT tables. It is the existing AFAT database, **not a newly provisioned project**. It is an identifier and does NOT grant authorization in another chat or create a connector connection. Future agents must use their own authorized Supabase connection/credentials; **never check service-role keys, database passwords, access tokens or credential URLs into GitHub**.

## Verified database observations
- AFAT functions `afat_route_canonical`, `afat_offline_city_pack`, `afat_atlas_nearby` exist.
- Counts at the time of inspection: atlas nodes 839, atlas edges 878, geo source records 8756, places 771.
- A read-only live call `afat_route_canonical(3.866,11.516,3.875,11.526,'car',1200)` returned `status=unavailable`, reason `no_shared_connected_component_within_snap_radius`. **The existing graph cannot currently be claimed to route this example journey.**
- The routing API and dashboard fallback code are staged in draft PR #112, not deployed. Real operational verification remains required.

## Safe resumption
1. Confirm Supabase project id by connected `list_projects`/`get_project` on resumption.
2. Review existing schema/migrations and route graph connectivity before altering production data.
3. Use synthetic test data in an isolated environment for write/booking/payment tests; never fabricate production transaction or route evidence.
4. Keep infrastructure credentials solely in protected deployment/secret managers.
5. Continue from `docs/engineering/EXECUTION_CHECKPOINT.md`.
