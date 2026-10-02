export type Role = "admin" | "investigator" | "examiner";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type Integrity = "match" | "mismatch" | "unreadable" | null;

export interface Evidence {
  id: string;
  title: string;
  description: string | null;
  evidence_type: string;
  sha256_hash: string;
  status: string;
  uploaded_by: string;
  uploaded_by_name: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: string | null;
  created_at: string;
  updated_at: string;
  integrity: Integrity;
  last_verified_at: string | null;
}

export interface EvidenceList {
  evidence: Evidence[];
  total: number;
  page: number;
  page_size: number;
}

export interface EvidenceStats {
  total: number;
  verified: number;
  mismatch: number;
  unavailable: number;
  unverified: number;
  recent_uploads: number;
}

export interface EvidenceOptions {
  types: string[];
  max_upload_bytes: number;
}

export interface CustodyEntry {
  id: string;
  action: string;
  from_user_id: string | null;
  notes: string | null;
  recorded_at: string;
}

export interface CustodyFeedEvent {
  id: string;
  evidence_id: string;
  evidence_title: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  notes: string | null;
  recorded_at: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
}

export interface LatestVerification {
  result: "match" | "mismatch" | "unreadable";
  recorded_sha256: string;
  computed_sha256: string | null;
  reason: string | null;
  verified_at: string;
  verified_by: string | null;
}

export interface VerifyResult {
  result: "match" | "mismatch" | "unreadable";
  reason?: string;
  message?: string;
  recorded_sha256?: string;
  computed_sha256?: string | null;
  note: string;
}

export interface EvidenceFilters {
  q?: string;
  type?: string;
  integrity?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  page_size?: number;
}