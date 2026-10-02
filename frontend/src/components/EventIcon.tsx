import { Download, FilePlus2, KeyRound, LogIn, ShieldAlert, ShieldCheck, ShieldX, UserPlus, type LucideIcon } from "lucide-react";
import { toneFor } from "../lib/labels";

const icons: Record<string, LucideIcon> = {
  registered: FilePlus2, accessed: Download, integrity_match: ShieldCheck, integrity_mismatch: ShieldX, integrity_unreadable: ShieldAlert,
  "auth.register": UserPlus, "auth.login": LogIn, "auth.login_failed": KeyRound, "evidence.register": FilePlus2,
  "evidence.verify": ShieldCheck, "evidence.download": Download, "evidence.access_denied": ShieldAlert, "access.denied": ShieldAlert,
};

export function EventIcon({ action, toneOverride }: { action: string; toneOverride?: string }) {
  const Icon = icons[action] ?? ShieldCheck;
  return <span className={`ico tone-${toneOverride ?? toneFor(action)}`}><Icon size={16} aria-hidden /></span>;
}