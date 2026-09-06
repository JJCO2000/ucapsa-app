# UCAPSA remote Supabase schema manifest

Captured directly from the linked production Supabase project on 2026-09-06. Metadata only; no customer rows or secrets are included.

## Structural counts

- public tables: 32
- public tables with RLS enabled: 32
- columns: 391
- functions: 45
- policies: 80
- indexes: 117
- triggers: 36

## Deterministic metadata fingerprints

- columns MD5: `30883a475b3b535b0f69873848ae4c9e`
- constraints MD5: `f733791eee255025c4e5d4acbb3cd5c0`
- indexes MD5: `8eef71252d9eb6e9ea96e15ef7bf4a29`
- policies MD5: `b5f0ee6f456f64baa846d96e35da1b86`
- functions MD5: `2a43052c4d7b75f7189fc0e512aee9e1`
- triggers MD5: `ba8dea10aefb737a51a11d87ea7f4fd5`
- enums MD5: `cb3918f4bbb61e687afc4d552f0af3aa`

These fingerprints are generated from canonical PostgreSQL metadata ordered by object name. Any structural drift changes at least one fingerprint.

## Critical invariants verified remotely

- `attendance_qr_codes.program_code` only accepts `puppy`, `comandos`, or `member`.
- `program_attendances` has unique protection for `(enrollment_id, attendance_date)` and for `(session_id, enrollment_id)` when a session exists.
- `program_attendances` RLS allows clients to read their own attendance through ownership of the enrollment; direct writes are admin-only and client QR registration occurs through SECURITY DEFINER RPC.
- `register_program_attendance_admin` accepts `p_attendance_date`, validates the historical schedule/cycle/cancellation and creates or reuses the corresponding real session.
- `correct_program_attendance_admin` also validates historical schedule/cycle/cancellation before changing a record.
- Current `register_program_attendance_from_qr` overloads do **not** accept a date. They resolve `v_today` from Mexico City time and therefore only register the current calendar day.
- The 3-argument QR overload supports explicit confirmation outside the normal time window but still operates only on the current day.
- `practice_sessions.note` is persisted remotely and client-owned practice rows are protected by RLS.
- `program_enrollments.physical_card_number` is stored centrally in Supabase and has a unique normalized index per program when present.
- All 32 public base tables currently have row-level security enabled.

## Audit consequence

Historical attendance by a client scanning a saved QR image cannot be implemented safely as a UI-only change. It requires a new/changed RPC that accepts the intended attendance date and reuses the same server-side schedule, cycle, cancellation, ownership, card-validity and duplicate checks. Until that RPC is versioned, the app must not fake historical QR registration locally.
