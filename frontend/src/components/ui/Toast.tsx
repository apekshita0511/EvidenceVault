import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; message: string }
interface ToastApi { show: (kind: Kind, message: string) => void }

const Ctx = createContext<ToastApi | null>(null);
const icons = { success: CheckCircle2, error: XCircle, info: Info };

// Live-region toasts for the result of real operations (copy, upload, verify). Never used for fake success.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback((kind: Kind, message: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, [dismiss]);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
              <Icon size={16} aria-hidden /><span>{t.message}</span>
              <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}