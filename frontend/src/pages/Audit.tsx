import { useState } from "react";
import { Link } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { activityApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { AuditDetails } from "../components/AuditDetails";
import { EventIcon } from "../components/EventIcon";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { EmptyState, ListSkeleton } from "../components/ui/Misc";
import { formatDateTime } from "../lib/format";
import { auditLabels, labelFor } from "../lib/labels";
import { useAsync } from "../lib/useAsync";

const PAGE = 20;

export function AuditPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const feed = useAsync(() => activityApi.audit(PAGE, page * PAGE), [page]);
  const total = feed.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Audit Logs"
        subtitle={user?.role === "admin" ? "Security-relevant events across all users." : "Security-relevant events caused by your account."} />
      <Alert tone="info">Audit records are append-only for the application: database triggers reject edits and deletes. A database administrator or host operator with sufficient privileges could still alter them, so treat this log as a record, not as tamper-proof evidence.</Alert>
      <section className="card">
        {feed.error ? <div className="card-pad"><Alert tone="danger">{feed.error}</Alert></div>
          : feed.loading && !feed.data ? <ListSkeleton rows={6} />
          : total === 0 ? <EmptyState icon={ScrollText} title="No audit entries yet">Entries appear when you sign in, register or verify evidence, and when access is denied.</EmptyState>
          : (
            <>
              <div className="list">
                {feed.data?.entries.map((a) => (
                  <div className="list-item" key={a.id} style={{ alignItems: "flex-start" }}>
                    <EventIcon action={a.action} />
                    <div className="grow">
                      <div className="ttl">{labelFor(auditLabels, a.action)}</div>
                      <div className="sub">
                        {a.user_name ?? "Unauthenticated"} · {a.entity_type === "evidence" && a.entity_id ? <Link to={`/vault/${a.entity_id}`}>evidence #{a.entity_id}</Link> : a.entity_id ? `${a.entity_type} #${a.entity_id}` : null}{a.entity_id ? " · " : ""}<time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                      </div>
                      <AuditDetails details={a.details} />
                    </div>
                  </div>
                ))}
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