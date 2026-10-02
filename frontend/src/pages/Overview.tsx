import { Link, useNavigate } from "react-router-dom";
import { Archive, CircleAlert, CircleCheck, CalendarPlus, Files, Link2, Upload } from "lucide-react";
import { activityApi, evidenceApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { EventIcon } from "../components/EventIcon";
import { IntegrityBadge } from "../components/IntegrityBadge";
import { OutcomeBadge } from "../components/OutcomeBadge";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { EmptyState, ListSkeleton, Skeleton } from "../components/ui/Misc";
import { relativeTime } from "../lib/format";
import { auditLabels, custodyLabels, labelFor } from "../lib/labels";
import { useAsync } from "../lib/useAsync";
import type { ReactNode } from "react";

function Panel({ title, to, linkLabel, state, children }: { title: string; to: string; linkLabel: string; state: { loading: boolean; error: string | null }; children: ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <div className="card-head"><h2>{title}</h2><Link to={to}>{linkLabel}</Link></div>
      {state.loading ? <ListSkeleton rows={3} /> : state.error ? <div className="card-pad"><Alert tone="danger">{state.error}</Alert></div> : children}
    </section>
  );
}
const None = ({ children }: { children: ReactNode }) => <p className="card-pad" style={{ color: "var(--text-muted)" }}>{children}</p>;

export function OverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const stats = useAsync(() => evidenceApi.stats(), []);
  const recent = useAsync((signal) => evidenceApi.list({ page_size: 5 }, signal), []);
  const verifications = useAsync(() => activityApi.custody(5, 0, { action: "integrity" }), []);
  const custody = useAsync(() => activityApi.custody(5, 0), []);
  const audit = useAsync(() => activityApi.audit(5, 0), []);
  const s = stats.data?.stats;
  const goUpload = () => navigate("/vault?upload=1");

  const metrics = [
    { label: "Total evidence", value: s?.total, icon: Files, tone: "info", sub: "Items you can access" },
    { label: "Verified", value: s?.verified, icon: CircleCheck, tone: "success", sub: "Latest check matched" },
    { label: "Failed checks", value: s?.failed, icon: CircleAlert, tone: "danger", sub: "Latest check failed" },
    { label: "Added this week", value: s?.recent_uploads, icon: CalendarPlus, tone: "neutral", sub: "Last 7 days" },
  ] as const;

  const total = s?.total ?? 0;
  const seg = s ? [
    { n: s.verified, color: "var(--success)", label: "Verified" },
    { n: s.unverified, color: "var(--warning)", label: "Not yet verified" },
    { n: s.failed, color: "var(--danger)", label: "Failed" },
  ] : [];

  return (
    <>
      <PageHeader title={`Welcome back, ${user?.name.split(" ")[0]}`} subtitle="A summary of your evidence and recent activity."
        actions={<>
          <Button onClick={() => navigate("/custody")}><Link2 size={16} />Chain of custody</Button>
          <Button onClick={() => navigate("/vault")}><Archive size={16} />Evidence Vault</Button>
          <Button variant="primary" onClick={goUpload}><Upload size={16} />Upload evidence</Button>
        </>} />

      {stats.error && <Alert tone="danger">Could not load summary: {stats.error}</Alert>}

      <section className="grid-metrics" aria-label="Summary">
        {metrics.map((m) => (
          <div className="card metric" key={m.label}>
            <div className="metric-top"><span>{m.label}</span><span className={`metric-icon tone-${m.tone}`}><m.icon size={16} aria-hidden /></span></div>
            {stats.loading ? <Skeleton w={60} h={28} /> : <div className="metric-value">{m.value ?? "-"}</div>}
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </section>

      {!stats.loading && !stats.error && total === 0 ? (
        <div className="card">
          <EmptyState icon={Archive} title="Your vault is empty"
            action={<Button variant="primary" onClick={goUpload}><Upload size={16} />Upload your first evidence</Button>}>
            Upload a file to record its SHA-256 digest and start a chain-of-custody trail. You can re-verify it at any time.
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="card card-pad" aria-label="Integrity status">
            <h2 style={{ marginBottom: 14 }}>Integrity verification status</h2>
            {stats.loading ? <Skeleton h={10} /> : (
              <>
                <div className="bar" role="img" aria-label={seg.map((x) => `${x.label}: ${x.n}`).join(", ")}>
                  {seg.filter((x) => x.n > 0).map((x) => <span key={x.label} style={{ flex: x.n, background: x.color }} />)}
                </div>
                <div className="legend">{seg.map((x) => <span key={x.label}><i style={{ background: x.color }} />{x.label} · {x.n}</span>)}</div>
              </>
            )}
          </section>

          <div className="grid-2">
            <div style={{ display: "grid", gap: 16 }}>
              <Panel title="Recently added evidence" to="/vault" linkLabel="View all" state={recent}>
                <div className="list">
                  {recent.data?.evidence.map((e) => (
                    <Link className="list-item" to={`/vault/${e.id}`} key={e.id}>
                      <div className="grow"><div className="ttl">{e.title}</div><div className="sub">{e.evidence_type} · {relativeTime(e.created_at)}</div></div>
                      <IntegrityBadge value={e.integrity} />
                    </Link>
                  ))}
                </div>
              </Panel>
              <Panel title="Latest verification results" to="/custody?action=integrity" linkLabel="View all" state={verifications}>
                {verifications.data?.events.length === 0 ? <None>No verification has been run yet. Open an evidence item and choose Verify integrity.</None> : (
                  <div className="list">
                    {verifications.data?.events.map((v) => (
                      <Link className="list-item" to={`/vault/${v.evidence_id}`} key={v.id}>
                        <EventIcon action={v.action} />
                        <div className="grow"><div className="ttl">{v.evidence_title}</div><div className="sub">{relativeTime(v.recorded_at)}{v.actor_name ? ` · ${v.actor_name}` : ""}</div></div>
                        <OutcomeBadge action={v.action} />
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Panel title="Recent custody events" to="/custody" linkLabel="View all" state={custody}>
                <div className="list">
                  {custody.data?.events.map((c) => (
                    <Link className="list-item" to={`/vault/${c.evidence_id}`} key={c.id}>
                      <EventIcon action={c.action} />
                      <div className="grow"><div className="ttl">{labelFor(custodyLabels, c.action)}</div><div className="sub">{c.evidence_title} · {relativeTime(c.recorded_at)}</div></div>
                    </Link>
                  ))}
                </div>
              </Panel>
              <Panel title="Recent audit activity" to="/audit" linkLabel="View audit log" state={audit}>
                {audit.data?.entries.length === 0 ? <None>No activity yet.</None> : (
                  <div className="list">
                    {audit.data?.entries.map((a) => (
                      <div className="list-item" key={a.id}>
                        <EventIcon action={a.action} />
                        <div className="grow"><div className="ttl">{labelFor(auditLabels, a.action)}</div><div className="sub">{relativeTime(a.created_at)}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}