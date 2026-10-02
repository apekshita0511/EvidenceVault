import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Archive, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SearchX, ShieldCheck, Upload } from "lucide-react";
import { evidenceApi } from "../api/endpoints";
import { IntegrityBadge } from "../components/IntegrityBadge";
import { PageHeader } from "../components/PageHeader";
import { UploadDialog } from "../components/UploadDialog";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { CopyButton, EmptyState, Skeleton } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { formatBytes, formatDateTime, shortHash } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { runVerification } from "../lib/verify";

const PAGE_SIZE = 10;

export function VaultPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [integrity, setIntegrity] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const uploadOpen = params.get("upload") === "1";

  // Debounce the search box so we do not query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const options = useAsync(() => evidenceApi.options(), []);
  const list = useAsync(
    (signal) => evidenceApi.list({ q, type, integrity, sort: sort.key, dir: sort.dir, page, page_size: PAGE_SIZE }, signal),
    [q, type, integrity, sort.key, sort.dir, page]
  );

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || type || integrity);
  async function verifyRow(id: string) {
    setVerifyingId(id);
    await runVerification(id, toast);
    setVerifyingId(null);
    list.reload(); // status always comes from the persisted result, never from a local guess
  }
  const setUpload = (open: boolean) => setParams(open ? { upload: "1" } : {}, { replace: true });

  const toggleSort = (key: string) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "title" ? "asc" : "desc" }));
    setPage(1);
  };
  const SortHead = ({ k, children }: { k: string; children: string }) => (
    <th aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => toggleSort(k)}>{children}{sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button>
    </th>
  );

  return (
    <>
      <PageHeader title="Evidence Vault" subtitle="Registered evidence and its recorded SHA-256 digests."
        actions={<Button variant="primary" onClick={() => setUpload(true)}><Upload size={16} />Upload evidence</Button>} />

      <section className="card" aria-label="Evidence list">
        <div className="toolbar">
          <div className="input-icon grow">
            <Search size={16} aria-hidden />
            <input className="input" type="search" placeholder="Search by title or file name" aria-label="Search evidence"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" aria-label="Filter by type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {options.data?.types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" aria-label="Filter by integrity status" value={integrity} onChange={(e) => { setIntegrity(e.target.value); setPage(1); }}>
            <option value="">All integrity states</option>
            <option value="verified">Verified</option>
            <option value="unverified">Not yet verified</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {list.error ? (
          <div className="card-pad"><Alert tone="danger">{list.error} <Button size="sm" onClick={list.reload}>Retry</Button></Alert></div>
        ) : list.loading && !list.data ? (
          <div className="card-pad" style={{ display: "grid", gap: 14 }} aria-busy="true" aria-label="Loading evidence">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={34} />)}
          </div>
        ) : total === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="No matching evidence"
              action={<Button onClick={() => { setSearch(""); setType(""); setIntegrity(""); }}>Clear filters</Button>}>
              Nothing matches the current search and filters.
            </EmptyState>
          ) : (
            <EmptyState icon={Archive} title="No evidence yet"
              action={<Button variant="primary" onClick={() => setUpload(true)}><Upload size={16} />Upload evidence</Button>}>
              Upload a file to register it and record its SHA-256 digest.
            </EmptyState>
          )
        ) : (
          <>
            <div className="table-wrap" style={{ opacity: list.loading ? 0.6 : 1 }}>
              <table className="table stack">
                <thead>
                  <tr>
                    <SortHead k="title">Evidence</SortHead>
                    <SortHead k="evidence_type">Type</SortHead>
                    <th>SHA-256</th>
                    <th>Integrity</th>
                    <SortHead k="created_at">Uploaded</SortHead>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.evidence.map((e) => (
                    <tr key={e.id}>
                      <td className="first"><Link to={`/vault/${e.id}`} className="cell-title">{e.title}</Link>
                        <div className="cell-sub">{e.original_filename ?? "-"} · {formatBytes(e.size_bytes)}</div></td>
                      <td data-label="Type">{e.evidence_type}</td>
                      <td data-label="SHA-256"><span className="hash">
                        <button className={`hash-btn${expanded === e.id ? " hash-expanded" : ""}`} aria-expanded={expanded === e.id}
                          aria-label="Show full SHA-256" title="Click to show or hide the full digest"
                          onClick={() => setExpanded((x) => (x === e.id ? null : e.id))}>
                          {expanded === e.id ? e.sha256_hash : shortHash(e.sha256_hash)}
                        </button>
                        <CopyButton value={e.sha256_hash} label="Copy full SHA-256" /></span></td>
                      <td data-label="Integrity"><IntegrityBadge value={e.integrity} /></td>
                      <td data-label="Uploaded">{formatDateTime(e.created_at)}<div className="cell-sub">by {e.uploaded_by_name}</div></td>
                      <td data-label=""><div className="actions" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <Button size="sm" loading={verifyingId === e.id} disabled={verifyingId !== null} onClick={() => verifyRow(e.id)}
                          aria-label={`Verify integrity of ${e.title}`}><ShieldCheck size={14} />Verify</Button>
                        <Link to={`/vault/${e.id}`} className="btn btn-secondary btn-sm">Open</Link></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="actions">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={14} />Prev</Button>
                <Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">Next<ChevronRight size={14} /></Button>
              </div>
            </div>
          </>
        )}
      </section>

      <UploadDialog open={uploadOpen} onClose={() => setUpload(false)} knownTypes={options.data?.types ?? []}
        maxBytes={options.data?.max_upload_bytes ?? null}
        onUploaded={(ev) => { setUpload(false); toast.show("success", `"${ev.title}" registered. Server-computed SHA-256 ${shortHash(ev.sha256_hash)}.`); setPage(1); list.reload(); options.reload(); }} />
    </>
  );
}