export const custodyLabels: Record<string, string> = {
  registered: "Evidence registered",
  accessed: "File downloaded",
  integrity_match: "Integrity check passed",
  integrity_mismatch: "Integrity mismatch detected",
  integrity_unreadable: "Verification unavailable: file missing or unreadable",
};

export const auditLabels: Record<string, string> = {
  "auth.register": "Account registered",
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in attempt",
  "evidence.register": "Evidence registered",
  "evidence.verify": "Integrity verification run",
  "evidence.integrity_mismatch": "Integrity mismatch detected (security event)",
  "evidence.download": "Evidence downloaded",
  "evidence.access_denied": "Evidence access denied",
  "access.denied": "Route access denied",
};

export const labelFor = (map: Record<string, string>, action: string) => map[action] ?? action;

export type Tone = "success" | "danger" | "warning" | "neutral" | "info";

export const toneFor = (action: string): Tone =>
  action === "integrity_match" ? "success"
  : action.includes("mismatch") || action.includes("denied") || action.includes("failed") ? "danger"
  : action === "integrity_unreadable" ? "info"
  : action === "registered" || action === "evidence.register" ? "info"
  : "neutral";