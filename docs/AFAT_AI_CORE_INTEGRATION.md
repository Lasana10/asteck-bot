# AFAT → independent AI-CORE

The new trusted backend client in `src/services/aiCore.ts` signs a tenant-bound request for AI-CORE. It only permits public, reviewed input for mobility/general tasks. A caller must authenticate the operator or approved public aggregation and validate the tenant before calling. **Never forward raw individual GPS trajectories, SOS messages, device IDs or unredacted private incidents as public input.**

Deployment requires `AI_CORE_URL` and `AI_CORE_KEY_AFAT` on the AFAT backend and matching key on AI-CORE. The client is not automatically wired to dispatch or the public reporting flow until those classifications and credentials are validated.

This is only the network client, not on-device inference; offline field collection should work independently of cloud model availability.
