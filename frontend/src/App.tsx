import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginPage, RegisterPage } from "./pages/AuthForms";
import { OverviewPage } from "./pages/Overview";
import { VaultPage } from "./pages/Vault";
import { EvidenceDetailPage } from "./pages/EvidenceDetail";
import { CustodyPage } from "./pages/Custody";
import { AuditPage } from "./pages/Audit";

// Unauthenticated users never see any workspace route.
function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <div className="center-screen"><Loader2 className="spin" aria-label="Loading" /></div>;
  if (status === "anon") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppShell />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<RequireAuth />}>
              <Route index element={<OverviewPage />} />
              <Route path="vault" element={<VaultPage />} />
              <Route path="vault/:id" element={<EvidenceDetailPage />} />
              <Route path="custody" element={<CustodyPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}