import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

const icons = { danger: XCircle, success: CheckCircle2, info: Info, warning: AlertTriangle };

export function Alert({ tone = "info", children }: { tone?: keyof typeof icons; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon size={16} aria-hidden />
      <div>{children}</div>
    </div>
  );
}