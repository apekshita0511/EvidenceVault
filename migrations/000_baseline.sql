-- Baseline: mirrors the schema that already exists in the evidencevault database.
-- Every statement is idempotent, so applying it to the existing database is a no-op.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'investigator'
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'investigator', 'examiner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  evidence_type VARCHAR(100) NOT NULL,
  file_path TEXT NOT NULL,
  sha256_hash CHAR(64) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'submitted'
    CONSTRAINT evidence_status_check CHECK (status IN ('submitted', 'under_review', 'verified', 'archived')),
  uploaded_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence (uploaded_by);

CREATE TABLE IF NOT EXISTS chain_of_custody (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_id BIGINT NOT NULL REFERENCES evidence(id),
  action VARCHAR(100) NOT NULL,
  from_user_id BIGINT REFERENCES users(id),
  to_user_id BIGINT REFERENCES users(id),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custody_evidence_id ON chain_of_custody (evidence_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
