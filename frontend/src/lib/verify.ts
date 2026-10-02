import { ApiError } from "../api/client";
import { evidenceApi } from "../api/endpoints";
import type { VerifyResult } from "../api/types";

type Toast = { show: (kind: "success" | "error" | "info", message: string) => void };

// Runs the real server-side verification and reports the outcome. Returns null if the request itself failed
// (network, 401/403/404, 5xx): in that case nothing is claimed about integrity.
export async function runVerification(id: string, toast: Toast): Promise<VerifyResult | null> {
  try {
    const r = await evidenceApi.verify(id);
    if (r.result === "match") toast.show("success", "Integrity check passed: recomputed SHA-256 matches the recorded digest.");
    else if (r.result === "mismatch") toast.show("error", "Integrity check failed: SHA-256 does not match the recorded digest.");
    else toast.show("error", "Integrity check failed: stored file is missing or unreadable.");
    return r;
  } catch (e) {
    toast.show("error", `Verification could not be completed: ${e instanceof ApiError ? e.message : "unexpected error"}`);
    return null;
  }
}