import { Fragment, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Link2, X } from "lucide-react";
import { activityApi } from "../api/endpoints";
import { EventIcon } from "../components/EventIcon";
import { OutcomeBadge } from "../components/OutcomeBadge";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { EmptyState, ListSkeleton } from "../components/ui/Misc";
import { formatDateTime, formatDay } from "../lib/format";
import { custodyLabels, labelFor } from "../lib/labels";
import { useAsync } from "../lib/useAsync";

const PAGE = 20;
const ACTIONS = [
  { value: "", label: "All events" },
  { value: "registered", label: "Registered" },
  { value: "accessed", label: "File downloaded" },
  { value: "integrity", label: "All verifications" },
  { value: "integrity_match", label: "Verification: match" },
  { value: "integrity_mismatch", label: "Verification: mismatch" },
  { value: "integrity_unreadable", label: "Verification: unreadable" },
];

export function CustodyPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const evidenceId = params.get("evidence") ?? "";
  const [page, setPage] = useState(0);

  const feed = useAsync(
    () => activityApi.custody(PAGE, page * PAGE, { action, evidence_id: evidenceId }),
    [page, action, evidenceId]
  );
  const total = feed.data?.total ?? 0;
  const events = feed.data?.events ?? [];
  const filtered = Boolean(action || evidenceId);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  return (
    <>
      <PageHeader title="Chain of Custody" subtitle="Registration, download and verification events for evidence you can access, newest first." />
      <Alert tone="info">Events are recorded by the server with its own timestamps and cannot be edited or deleted through the application. This is a record of actions taken in EvidenceVault, not proof of custody outside it, and a database administrator could still alter the underlying table.</Alert>
      <section className="card">
        <div className="toolbar">
          <select className="select" aria-label="Filter by event type" value={action} onChange={(e) => update("action", e.target.value)}>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {evidenceId && (
            <span className="badge badge-info">Evidence #{evidenceId}
              <button className="toast-x" aria-label="Clear evidence filter" onClick={() => update("evidence", "")}><X size={12} /></button></span>
          )}
          {filtered && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
        </div>
        {feed.error ? <div className="card-pad"><Alert tone="danger">{feed.error}</Alert></div>
          : feed.loading && !feed.data ? <ListSkeleton rows={6} />
          : total === 0 ? (
            <EmptyState icon={Link2} title={filtered ? "No matching events" : "No custody events yet"}>
              {filtered ? "No events match the current filters." : "Events appear here when evidence is registered, downloaded or verified."}
            </EmptyState>
          ) : (
            <>
              <div className="timeline" style={{ opacity: feed.loading ? 0.6 : 1 }}>
                {events.map((ev, i) => {
                  const day = formatDay(ev.recorded_at);
                  const newDay = i === 0 || day !== formatDay(events[i - 1]!.recorded_at);
                  return (
                    <Fragment key={ev.id}>
                      {newDay && <div className="tl-day">{day}</div>}
                      <div className="tl-item">
                        <EventIcon action={ev.action} />
                        <div className="tl-body">
                          <div className="tl-title">{labelFor(custodyLabels, ev.action)} <OutcomeBadge action={ev.action} /></div>
                          <div className="tl-meta">
                            <Link to={`/vault/${ev.evidence_id}`}>{ev.evidence_title}</Link>
                            <span>#{ev.evidence_id}</span>
                            <span>by {ev.actor_name ?? "unknown"}</span>
                            <time dateTime={ev.recorded_at}>{formatDateTime(ev.recorded_at)}</time>
                            {!evidenceId && <button className="hash-btn" onClick={() => update("evidence", ev.evidence_id)}>Only this evidence</button>}
                          </div>
                          {ev.notes && <div className="tl-meta">{ev.notes}</div>}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <div className="pager">
                <span>{page * PAGE + 1}-{Math.min((page + 1) * PAGE, total)} of {total}</span>
                <div className="actions">
                  <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</Button>
                  <Button size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Older</Button>
                </div>
              </div>
            </>
          )}
      </section>
    </>
  );
}