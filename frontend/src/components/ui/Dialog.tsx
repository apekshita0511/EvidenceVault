import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

// Native <dialog>: gives focus trapping, Escape-to-close and inert background for free.
export function Dialog({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title"
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog"><X size={16} /></Button>
          </div>
          {children}
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}