-- Additive only: nullable columns so existing rows stay valid.
ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(255),
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_sha256_format CHECK (sha256_hash ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_file_path ON evidence (file_path);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
