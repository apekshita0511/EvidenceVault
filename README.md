# EvidenceVault

Node.js + Express + TypeScript + PostgreSQL backend for digital evidence integrity and chain-of-custody records.

> A matching SHA-256 shows that the checked bytes equal the hash recorded at registration. It does **not** prove authenticity, admissibility, truthfulness, or when/where/by whom the evidence originated.

## Architecture

```
src/
  app.ts, server.ts      Express app (testable) and process entry point
  config/                env loading, single shared pg Pool
  auth/                  register / login / me, rate limiting
  evidence/              upload (multer), controller, routes
  middleware/            JWT authentication, role check, error handler
  services/audit.service.ts   append-only audit + custody writers
  scripts/               SQL migration runner
migrations/              versioned SQL (000 baseline, 001 file metadata, 002 append-only triggers)
tests/                   node:test suites against an isolated test database
```

## Setup

Prerequisites: Node 20+, PostgreSQL with a database named `evidencevault`.

```
npm install
copy .env.example .env      # then fill in real values (never commit .env)
npm run migrate             # applies pending migrations; additive, never drops data
npm run dev                 # backend only, http://localhost:5000 (tsx watch)
npm run dev:web             # frontend dev server, http://localhost:5173 (proxies /api to :5000)
npm run build:all && npm start   # production: builds API + UI, serves both on :5000
```

`npm run setup` installs root and `frontend/` dependencies. In dev, open the Vite URL (5173). In production the Express server also serves the built UI from `frontend/dist`, so everything is on port 5000. To point the dev proxy at a different backend: `API_PROXY_TARGET=http://localhost:5055 npm run dev:web`.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default 5000) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` | **Required**, min 16 chars. Server refuses to start without it |
| `JWT_EXPIRES_IN` | Token lifetime (default `1h`) |
| `EVIDENCE_DIR` | Evidence storage directory (default `storage/evidence`, outside any static path) |
| `MAX_UPLOAD_BYTES` | Upload limit (default 25 MB) |
| `AUTH_RATE_LIMIT` | Login/register attempts per IP per 15 min (default 20) |
| `CORS_ORIGIN` | Comma-separated allowed origins (default: none) |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health`, `/db-health` | public |
| POST | `/api/auth/register` | always creates an `investigator`; role in body is ignored |
| POST | `/api/auth/login` | returns JWT |
| GET | `/api/auth/me` | current user |
| POST | `/api/evidence` | multipart: `file`, `title`, `evidence_type`, optional `description` |
| GET | `/api/evidence` | query: `q`, `type`, `integrity` (verified/unverified/failed), `sort`, `dir`, `page`, `page_size`; each item has derived `integrity` and `uploaded_by_name` |
| GET | `/api/evidence/stats`, `/api/evidence/options` | counts by integrity state plus uploads in the last 7 days; distinct types and upload size limit |
| GET | `/api/evidence/:id` | detail includes custody trail |
| GET | `/api/custody` | custody events for evidence you can access (`limit`, `offset`, optional `evidence_id`, `action` = registered/accessed/integrity/integrity_match/integrity_mismatch/integrity_unreadable) |
| GET | `/api/audit` | audit entries (`limit`, `offset`, optional `evidence_id`); admins see all, others only their own |
| GET | `/api/evidence/:id/download` | records an `accessed` custody event |
| POST | `/api/evidence/:id/verify` | re-hashes stored file; `match`, `mismatch` (200) or `unreadable` (409) |

Responses use `{ "success": boolean, ... }`. Examples (fake data):

```
curl -X POST localhost:5000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.test","password":"a-long-passphrase"}'
curl -X POST localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ada@example.test","password":"a-long-passphrase"}'
curl -X POST localhost:5000/api/evidence -H "Authorization: Bearer <token>" \
  -F title="Laptop image" -F evidence_type=disk_image -F file=@sample.bin
curl -X POST localhost:5000/api/evidence/1/verify -H "Authorization: Bearer <token>"
```

## Frontend

React + TypeScript + Vite in `frontend/` (React Router, Lucide icons, self-hosted Inter font, plain CSS design tokens). Pages: sign in / register, Overview, Evidence Vault (search, filters, sorting, pagination, upload dialog with progress), Evidence detail (verify, download, custody, audit), Chain of Custody, Audit Logs. All data comes from the API; nothing is mocked. The JWT is kept in `sessionStorage` (cleared when the tab closes); any script on the origin could read it, so the app loads no third-party scripts and the server sets a strict CSP via Helmet. An expired or invalid token signs the user out. "Verified" in the UI means the most recent verification run matched; "Not yet verified" means none has been run.

## Access model

Admins can see all evidence; other users only evidence they uploaded. Evidence you may not access returns `404`, the same as nonexistent evidence, and the denial is audit-logged. To make an admin, update the role directly in the database (registration cannot).

## Evidence storage

Files are saved under random UUID names in `EVIDENCE_DIR`; the client filename is stored only as metadata. SHA-256 is computed server-side from the stored bytes. `evidence.file_path` holds the storage name, not a client-supplied path. Files are never overwritten or deleted by the API.

## Testing

```
npm test
```

`npm test` drops and recreates a separate `evidencevault_test` database (name hardcoded) and uses a temporary evidence directory. It never touches `evidencevault`. The Postgres user needs `CREATEDB`.

## Security notes and limitations

- `audit_logs` and `chain_of_custody` are append-only via database triggers (UPDATE/DELETE/TRUNCATE rejected). This is **not** tamper-proof: a database superuser or table owner can drop the triggers or edit data, and anyone with host access can alter files and records. Stronger guarantees would need a restricted application DB role, external log shipping, or hash-chained/anchored logs. The app currently connects with whatever role `.env` provides; use a non-superuser role in real deployments.
- Evidence files are not encrypted at rest.
- No custody-transfer endpoint or evidence deletion/retention workflow is implemented yet.
- Rate limiting is in-memory and per process.
- Tokens are not revocable before expiry (the user is re-checked in the database on each request).