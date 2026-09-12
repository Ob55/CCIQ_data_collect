# CleanCook Data Collection

Internal platform for uploading XLSForms, collecting field submissions, reviewing them, and
exporting clean data. Next.js 15 (App Router, **plain JavaScript**) + Supabase. See
`cleancook-prd.md` for the full spec.

## Status: Complete — Phases 1–8

Built: Next.js/JS scaffold, full DB schema with RLS on every table, Supabase Auth (3 roles),
protected routing, seed script, and RLS access tests (Phase 1); the XLSForm parser (Phase 2);
form upload/deploy and versioning (Phase 3); the schema-driven runtime form and idempotent
submissions (Phase 4); the one-at-a-time review queue (Phase 5); XLSX/CSV export (Phase 6);
users admin, audit log, and the Playwright happy-path (Phase 7); and the **read-only MCP
server** for querying submission data from Claude (Phase 8, see [`mcp/`](./mcp/README.md)).

## Setup

```bash
npm install
cp .env.example .env.local     # fill in Supabase URL + keys

# Apply the schema to Supabase (requires the DB password):
supabase link --project-ref uqidqjuzuakovlpofadb
supabase db push

npm run seed                   # create the four demo users
npm run dev                    # http://localhost:3000
```

## Seed logins

All share the password `CleanCook!2026` (dev/staging only):

| Role       | Email                       |
| ---------- | --------------------------- |
| Admin      | admin@cleancook.test        |
| Supervisor | supervisor@cleancook.test   |
| Enumerator | enum1@cleancook.test        |
| Enumerator | enum2@cleancook.test        |

## Tests

```bash
npm test        # RLS access tests — asserts forbidden accesses are rejected by the DB
```

## Conventions

- **JavaScript only.** No `.ts`/`.tsx`, no `tsconfig.json` (PRD §4, §13).
- **Zod at every boundary** (`src/lib/schemas.js`).
- **RLS on every table**, defined in the same migration that creates it.
- Service-role key is **server-only** (`src/lib/supabase/admin.js`), never `NEXT_PUBLIC_`.

## Performance

- Auth is verified with `getClaims()` (local JWT verification) and deduped per render via React
  `cache()` in `src/lib/auth.js`, so a navigation costs **one** profile query — not repeated
  network `getUser()` round-trips. Local verification requires **asymmetric JWT signing keys**
  enabled in the Supabase dashboard (Auth → JWT keys); without them `getClaims()` falls back to a
  network call.
- `xlsx` (the heavy SheetJS tarball) is **lazy-loaded** (`await import`) in
  `src/lib/xlsform/parse.js`, so it only compiles/loads on the server paths that parse or export a
  workbook — not into every route.
- **Dev-mode slowness is expected.** `next dev` compiles each route on first hit (the multi-second
  `Compiling /route…` lines); this does **not** happen in production. Measure real speed with
  `npm run build && npm start`, not `npm run dev`.

## Security operations (outside code — do these in the Supabase dashboard/hosting)

These are the operational half of the security checklist; the code enforces the rest (RLS,
Zod, server-only service key, private buckets + short-lived signed URLs, per-user rate limit,
append-only audit log).

- **Enable MFA** on the Supabase account, and use **least-privilege access tokens** for CI/CLI.
- **Separate staging and production** Supabase projects — never test against real household data.
  (`supabase link` currently points at a single project; add a distinct prod ref.)
- **Backups on, and test a restore** — an untested backup is a rumour.
- **Test policies as each role.** Log in as an enumerator and confirm you cannot fetch another
  enumerator's submission or attachment; passing as admin proves nothing.
