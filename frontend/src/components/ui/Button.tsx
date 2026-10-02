import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm" | "icon";
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, block, className = "", children, disabled, type = "button", ...rest }: Props) {
  const cls = ["btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "icon" && "btn-icon", block && "btn-block", className]
    .filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 size={16} className="spin" aria-hidden />}
      {children}
    </button>
  );
}