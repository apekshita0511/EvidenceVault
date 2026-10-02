import type { ReactNode } from "react";
import { FileCheck2, Fingerprint, History, ShieldCheck } from "lucide-react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-brand" aria-label="About EvidenceVault">
        <div className="brand"><span className="brand-mark"><ShieldCheck size={18} aria-hidden /></span>EvidenceVault</div>
        <div>
          <h2>Evidence integrity you can demonstrate.</h2>
          <p className="lead">Register digital evidence, fingerprint it with SHA-256, and keep a custody and audit record of every action taken on it.</p>
          <ul className="points" style={{ marginTop: 32 }}>
            <li><Fingerprint size={18} aria-hidden /><span><b>Server-side SHA-256</b>Hashes are computed from the stored bytes, never trusted from the client.</span></li>
            <li><FileCheck2 size={18} aria-hidden /><span><b>On-demand verification</b>Re-hash stored files and compare against the recorded digest.</span></li>
            <li><History size={18} aria-hidden /><span><b>Chain of custody</b>Registration, access and verification events are recorded with server timestamps.</span></li>
          </ul>
        </div>
        <p className="auth-fine">A matching hash shows the checked bytes equal the recorded digest. It does not by itself prove authenticity or origin.</p>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-mobile-brand"><span className="brand-mark"><ShieldCheck size={16} aria-hidden /></span>EvidenceVault</div>
          {children}
        </div>
      </section>
    </div>
  );
}