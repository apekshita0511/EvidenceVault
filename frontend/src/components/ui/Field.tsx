import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "./Button";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  children?: ReactNode;
}

export function Field({ label, error, hint, optional, id, ...input }: Props) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  const isPassword = input.type === "password";
  const [shown, setShown] = useState(false);

  return (
    <div className="field">
      <label htmlFor={inputId}>{label} {optional && <span className="opt">(optional)</span>}</label>
      <div className={isPassword ? "input-wrap" : undefined}>
        <input
          id={inputId}
          className="input"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
          type={isPassword && shown ? "text" : input.type}
        />
        {isPassword && (
          <Button variant="ghost" size="icon" onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        )}
      </div>
      {error ? <p id={`${inputId}-err`} className="field-error"><AlertCircle size={14} aria-hidden />{error}</p>
        : hint ? <p id={`${inputId}-hint`} className="field-hint">{hint}</p> : null}
    </div>
  );
}