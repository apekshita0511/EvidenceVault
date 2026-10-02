import { useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileSearch, ShieldCheck } from "lucide-react";
import { ApiError, downloadFile } from "../api/client";
import { activityApi, evidenceApi } from "../api/endpoints";
import type { VerifyResult } from "../api/types";
import { AuditDetails } from "../components/AuditDetails";
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
  const [result, setResult] = useState<VerifyResult | null>(null);
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

  async function verify() {
    setVerifying(true); setActionError(null);
    const r = await runVerification(id, toast);
    if (r) { setResult(r); detail.reload(); audit.reload(); }
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
              {ev?.last_verified_at
                ? <p className="cell-sub">Last verification recorded {formatDateTime(ev.last_verified_at)}.</p>
                : <p className="cell-sub">This evidence has not been verified since it was registered.</p>}
              {result && (
                result.result === "match" ? (
                  <Alert tone="success">Integrity check passed: the stored file's SHA-256 equals the recorded digest.</Alert>
                ) : result.result === "mismatch" ? (
                  <Alert tone="danger">Integrity check failed: the stored file's SHA-256 differs from the recorded digest.
                    <div className="mono" style={{ marginTop: 6, wordBreak: "break-all" }}>recorded: {result.recorded_sha256}<br />computed: {result.computed_sha256}</div></Alert>
                ) : (
                  <Alert tone="danger">The stored file is missing or unreadable, so it could not be verified.</Alert>
                )
              )}
              <Alert tone="info">A match shows the checked bytes equal the recorded hash. It does not prove when, where or by whom the evidence originated, and it is not a complete chain of custody.</Alert>
            </div>
          </section>

          <section className="card" aria-label="Metadata">
            <div className="card-head"><h2>Details</h2></div>
            {!ev ? <div className="card-pad"><Skeleton h={80} /></div> : (
              <dl className="dl">
                <dt>SHA-256</dt><dd><div className="hash-full"><span style={{ flex: 1 }}>{ev.sha256_hash}</span><CopyButton value={ev.sha256_hash} label="Copy full SHA-256" /></div></dd>
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