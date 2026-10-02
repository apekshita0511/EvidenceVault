import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileSearch, ShieldCheck } from "lucide-react";
import { ApiError, downloadFile } from "../api/client";
import { activityApi, evidenceApi } from "../api/endpoints";
import type { LatestVerification } from "../api/types";import { AuditDetails } from "../components/AuditDetails";
import { EventIcon } from "../components/EventIcon";
import { IntegrityBadge } from "../components/IntegrityBadge";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { CopyButton, EmptyState, ListSkeleton, Skeleton } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { runVerification } from "../lib/verify";
import { formatBytes, formatDateTime } from "../lib/format";
import { auditLabels, custodyLabels, labelFor } from "../lib/labels";
import { useAsync } from "../lib/useAsync";

export function EvidenceDetailPage() {
  const { id = "" } = useParams();
  const detail = useAsync(() => evidenceApi.get(id), [id]);
  const audit = useAsync(() => activityApi.audit(10, 0, id), [id]);
  const toast = useToast();
  const [verifying, setVerifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.error && !detail.data) {
    return (
      <>
        <PageHeader title="Evidence" crumbs={[{ label: "Evidence Vault", to: "/vault" }, { label: "Not found" }]} />
        <div className="card"><EmptyState icon={FileSearch} title="Evidence not available">
          {detail.error} It may not exist, or you may not have access to it.
        </EmptyState></div>
      </>
    );
  }

  const ev = detail.data?.evidence;
  const lv = detail.data?.latest_verification ?? null;

  async function verify() {
    setVerifying(true); setActionError(null);
    const r = await runVerification(id, toast);
    if (r) { detail.reload(); audit.reload(); } // the card re-renders from the persisted backend record
    else setActionError("Verification could not be completed. No integrity result was recorded.");
    setVerifying(false);
  }
  async function download() {
    setActionError(null);
    try {
      await downloadFile(`/api/evidence/${encodeURIComponent(id)}/download`, ev?.original_filename ?? `evidence-${id}`);
      detail.reload(); audit.reload();
      toast.show("info", "Download started. An access event was added to the chain of custody.");
    } catch (e) { setActionError(e instanceof ApiError ? e.message : "Download failed."); }
  }

  return (
    <>
      <PageHeader
        title={ev?.title ?? "Loading…"}
        crumbs={[{ label: "Evidence Vault", to: "/vault" }, { label: ev ? `#${ev.id}` : "…" }]}
        subtitle={ev && <>{ev.evidence_type} · uploaded by {ev.uploaded_by_name} on {formatDateTime(ev.created_at)}</>}
        actions={<>
          <Button onClick={download} disabled={!ev}><Download size={16} />Download</Button>
          <Button variant="primary" onClick={verify} loading={verifying} disabled={!ev}><ShieldCheck size={16} />Verify integrity</Button>
        </>} />

      {actionError && <Alert tone="danger">{actionError}</Alert>}

      <div className="grid-2">
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card" aria-label="Integrity">
            <div className="card-head"><h2>Integrity</h2>{ev && <IntegrityBadge value={ev.integrity} />}</div>
            <div className="verify-panel">
              {detail.loading && !detail.data ? <Skeleton h={48} /> : <VerificationBanner v={lv} />}
              {ev && (
                <dl className="dl" style={{ padding: 0 }}>
                  <dt>Recorded SHA-256</dt>
                  <dd><div className="hash-full"><span style={{ flex: 1 }}>{ev.sha256_hash}</span><CopyButton value={ev.sha256_hash} label="Copy recorded SHA-256" /></div></dd>
                  <dt>Latest calculated SHA-256</dt>
                  <dd>{lv?.computed_sha256
                    ? <div className={`hash-full${lv.result === "mismatch" ? " differs" : ""}`}><span style={{ flex: 1 }}>{lv.computed_sha256}</span><CopyButton value={lv.computed_sha256} label="Copy calculated SHA-256" /></div>
                    : <span className="cell-sub">{lv ? "Not available: the file could not be hashed in the last check." : "No verification has been run."}</span>}</dd>
                  <dt>Last verified</dt>
                  <dd>{lv ? <>{formatDateTime(lv.verified_at)}{lv.verified_by && <span className="cell-sub"> by {lv.verified_by}</span>}</> : <span className="cell-sub">Never</span>}</dd>
                </dl>
              )}
              <Alert tone="info">A matching SHA-256 digest indicates that the checked file bytes match the recorded digest. A mismatch indicates that the bytes differ from the recorded digest; it does not by itself establish when, how, or by whom the change occurred.</Alert>
            </div>
          </section>
          <section className="card" aria-label="Metadata">
            <div className="card-head"><h2>Details</h2></div>
            {!ev ? <div className="card-pad"><Skeleton h={80} /></div> : (
              <dl className="dl">
                <dt>File name</dt><dd>{ev.original_filename ?? "-"}</dd>
                <dt>Size</dt><dd>{formatBytes(ev.size_bytes)}</dd>
                <dt>Content type</dt><dd>{ev.mime_type ?? "-"} <span className="cell-sub">(as reported by the uploader)</span></dd>
                <dt>Description</dt><dd>{ev.description ?? <span className="cell-sub">None</span>}</dd>
                <dt>Case status</dt><dd style={{ textTransform: "capitalize" }}>{ev.status.replace("_", " ")}</dd>
                <dt>Registered</dt><dd>{formatDateTime(ev.created_at)}</dd>
              </dl>
            )}
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section className="card" aria-label="Chain of custody">
            <div className="card-head"><h2>Chain of custody</h2></div>
            {detail.loading && !detail.data ? <ListSkeleton rows={3} /> : (
              <div className="timeline">
                {detail.data?.chain_of_custody.map((c) => (
                  <div className="tl-item" key={c.id}>
                    <EventIcon action={c.action} />
                    <div className="tl-body">
                      <div className="tl-title">{labelFor(custodyLabels, c.action)}</div>
                      <div className="tl-meta"><span>{formatDateTime(c.recorded_at)}</span></div>
                      {c.notes && <div className="tl-meta">{c.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-label="Audit activity">
            <div className="card-head"><h2>Your audit activity on this item</h2></div>
            {audit.loading && !audit.data ? <ListSkeleton rows={3} /> : audit.error ? <div className="card-pad"><Alert tone="danger">{audit.error}</Alert></div> : (
              <div className="list">
                {audit.data?.entries.length === 0 && <p className="card-pad" style={{ color: "var(--text-muted)" }}>No audit entries.</p>}
                {audit.data?.entries.map((a) => (
                  <div className="list-item" key={a.id} style={{ alignItems: "flex-start" }}>
                    <EventIcon action={a.action} />
                    <div className="grow"><div className="ttl">{labelFor(auditLabels, a.action)}</div>
                      <div className="sub">{formatDateTime(a.created_at)}</div><AuditDetails details={a.details} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

const reasonText: Record<string, string> = {
  missing_or_unreadable: "The stored file is missing or unreadable. This does not indicate tampering.",
  malformed_recorded_digest: "The recorded digest is malformed, so no comparison was possible.",
  unsafe_storage_path: "The stored file reference is invalid, so no comparison was possible.",
};

// Reflects only the persisted result of a real server-side verification.
function VerificationBanner({ v }: { v: LatestVerification | null }) {
  if (!v) return <Alert tone="warning"><b>Not yet verified.</b> No integrity check has been run on this evidence.</Alert>;
  if (v.result === "match") return <Alert tone="success"><b>Integrity match.</b> The recalculated SHA-256 equals the recorded digest.</Alert>;
  if (v.result === "mismatch") return <Alert tone="danger"><b>Integrity mismatch detected.</b> The stored file's bytes differ from the recorded digest.</Alert>;
  return <Alert tone="info"><b>Verification unavailable.</b> {reasonText[v.reason ?? ""] ?? "The file could not be checked."}</Alert>;
}