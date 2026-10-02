-- Make custody and audit history append-only for ordinary application behaviour.
-- A superuser or table owner can still drop these triggers; see README trust limitations.
CREATE OR REPLACE FUNCTION forbid_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted: table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();

CREATE TRIGGER chain_of_custody_append_only
  BEFORE UPDATE OR DELETE ON chain_of_custody
  FOR EACH ROW EXECUTE FUNCTION forbid_modification();
CREATE TRIGGER chain_of_custody_no_truncate
  BEFORE TRUNCATE ON chain_of_custody
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_modification();
