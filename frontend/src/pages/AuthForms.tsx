import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { AuthLayout } from "./AuthLayout";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Errors = Partial<Record<"name" | "email" | "password", string>>;

function validate(values: { name?: string; email: string; password: string }, mode: "login" | "register"): Errors {
  const errors: Errors = {};
  if (mode === "register" && !values.name?.trim()) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (mode === "register") {
    if (values.password.length < 8) errors.password = "Use at least 8 characters.";
    else if (new TextEncoder().encode(values.password).length > 72) errors.password = "Use at most 72 bytes.";
  } else if (!values.password) errors.password = "Enter your password.";
  return errors;
}

function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { status, login, register, sessionExpired } = useAuth();
  const location = useLocation();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  if (status === "authed") return <Navigate to={(location.state as { from?: string } | null)?.from ?? "/"} replace />;

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k as keyof Errors]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // prevent duplicate submissions
    const found = validate(values, mode);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (isLogin) await login(values.email.trim(), values.password);
      else await register(values.name.trim(), values.email.trim(), values.password);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unexpected error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <h1>{isLogin ? "Sign in" : "Create your account"}</h1>
        <p className="sub">{isLogin ? "Access your evidence workspace." : "New accounts are created as investigators."}</p>
      </div>
      {sessionExpired && isLogin && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
      {formError && <Alert tone="danger">{formError}</Alert>}
      <form onSubmit={submit} noValidate>
        {!isLogin && <Field label="Full name" autoComplete="name" value={values.name} onChange={set("name")} error={errors.name} />}
        <Field label="Email" type="email" autoComplete="email" value={values.email} onChange={set("email")} error={errors.email} />
        <Field label="Password" type="password" autoComplete={isLogin ? "current-password" : "new-password"}
          value={values.password} onChange={set("password")} error={errors.password}
          hint={isLogin ? undefined : "8 to 72 characters."} />
        <Button type="submit" variant="primary" block loading={busy}>{isLogin ? "Sign in" : "Create account"}</Button>
      </form>
      <p className="auth-switch">
        {isLogin ? <>New to EvidenceVault? <Link to="/register">Create an account</Link></> : <>Already registered? <Link to="/login">Sign in</Link></>}
      </p>
    </AuthLayout>
  );
}

export const LoginPage = () => <AuthForm mode="login" />;
export const RegisterPage = () => <AuthForm mode="register" />;