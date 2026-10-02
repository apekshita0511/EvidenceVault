import { shortHash } from "../lib/format";

const hide = new Set(["path"]);

// Renders a few facts from an audit entry's JSON details. Values are rendered as text only.
export function AuditDetails({ details }: { details: Record<string, unknown> }) {
  const chips = Object.entries(details).filter(([k, v]) => !hide.has(k) && v !== null && v !== undefined && typeof v !== "object");
  if (!chips.length) return null;
  return (
    <div className="chips">
      {chips.map(([k, v]) => {
        const text = String(v);
        return <span className="chip" key={k} title={text}>{k}: {/sha256/.test(k) && text.length === 64 ? shortHash(text) : text}</span>;
      })}
    </div>
  );
}