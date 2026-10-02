import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Copy } from "lucide-react";
import { Button } from "./Button";
import { useToast } from "./Toast";
import type { Tone } from "../../lib/labels";

export const Skeleton = ({ w = "100%", h = 14 }: { w?: number | string; h?: number }) => (
  <div className="skeleton" style={{ width: w, height: h }} aria-hidden />
);

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={20} aria-hidden /></div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Badge({ tone = "neutral", icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{Icon && <Icon size={13} aria-hidden />}{children}</span>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      toast.show("success", "SHA-256 copied to clipboard.");
    } catch {
      toast.show("error", "Could not access the clipboard. Select the value and copy it manually.");
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={copy} aria-label={done ? "Copied" : label} title={done ? "Copied" : label}>
      {done ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  );
}

export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="list" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <div className="list-item" key={i}><div className="skeleton ico" /><div className="grow"><Skeleton w="60%" /><div style={{ height: 6 }} /><Skeleton w="35%" h={11} /></div></div>
    ))}
  </div>
);