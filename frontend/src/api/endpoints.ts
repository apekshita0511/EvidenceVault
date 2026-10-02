import { request, uploadWithProgress } from "./client";
import type {
  AuditEntry, CustodyEntry, LatestVerification, CustodyFeedEvent, Evidence, EvidenceFilters, EvidenceList,
  EvidenceOptions, EvidenceStats, User, VerifyResult,
} from "./types";

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("POST", "/api/auth/login", { json: { email, password } }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("POST", "/api/auth/register", { json: { name, email, password } }),
  me: () => request<{ user: User }>("GET", "/api/auth/me"),
};

export const evidenceApi = {
  list: (f: EvidenceFilters, signal?: AbortSignal) =>
    request<EvidenceList>("GET", `/api/evidence${qs({ ...f })}`, { signal }),
  stats: () => request<{ stats: EvidenceStats }>("GET", "/api/evidence/stats"),
  options: () => request<EvidenceOptions>("GET", "/api/evidence/options"),
  get: (id: string) =>
    request<{ evidence: Evidence; chain_of_custody: CustodyEntry[]; latest_verification: LatestVerification | null }>("GET", `/api/evidence/${encodeURIComponent(id)}`),
  upload: (form: FormData, onProgress: (f: number) => void) =>
    uploadWithProgress<{ evidence: Evidence }>("/api/evidence", form, onProgress),
  // 409 means the stored file was unreadable: the body still carries the outcome.
  verify: (id: string) =>
    request<VerifyResult & { success: boolean; message?: string }>("POST", `/api/evidence/${encodeURIComponent(id)}/verify`, { allowStatuses: [409] }),
};

export const activityApi = {
  audit: (limit: number, offset: number, evidenceId?: string) =>
    request<{ entries: AuditEntry[]; total: number }>("GET", `/api/audit${qs({ limit, offset, evidence_id: evidenceId })}`),
  custody: (limit: number, offset: number, filters: { evidence_id?: string; action?: string } = {}) =>
    request<{ events: CustodyFeedEvent[]; total: number }>("GET", `/api/custody${qs({ limit, offset, ...filters })}`),
};