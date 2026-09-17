# UCAPSA Rango 1 — remote Supabase sync

Remote project: `hrfecmviyiluubymsoeq`
Date: 2026-09-17

Applied remotely and verified:

- `ucapsa_rango_1_foundation`
- access/security/performance hardening for Rango 1
- 10 Rango 1 tables have RLS enabled
- authenticated clients have SELECT only on Rango 1 tables, subject to RLS
- anon has no table privileges on Rango 1 tables
- service_role retains operational table access
- trigger-only validators are SECURITY INVOKER and not executable by anon/authenticated
- Rango 1 foreign keys introduced by the foundation are covered by indexes
- Supabase security/performance advisor findings introduced by Rango 1 were cleared; remaining advisor findings predate Rango 1

Legacy `ucapsa_points_*` data was intentionally preserved and not migrated or deleted. Rango 1 remains empty until scoring/range rules are explicitly defined.

`database.generated.ts` is intentionally not hand-edited. The repository overlay remains in place until the mechanical Supabase source-of-truth capture is run with the linked CLI workflow.
