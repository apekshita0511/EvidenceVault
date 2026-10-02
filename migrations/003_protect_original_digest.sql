-- The originally recorded digest, storage path and uploader of an evidence row must never change,
-- otherwise later verification could be made to "match" modified evidence.
-- Additive: no data is modified. Superusers/owners can still drop the trigger (see README limitations).
CREATE OR REPLACE FUNCTION protect_evidence_original() RETURNS trigger AS $$
BEGIN
  IF NEW.sha256_hash IS DISTINCT FROM OLD.sha256_hash
     OR NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    RAISE EXCEPTION 'evidence.sha256_hash, file_path and uploaded_by are immutable once recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_original_immutable
  BEFORE UPDATE ON evidence
  FOR EACH ROW EXECUTE FUNCTION protect_evidence_original();