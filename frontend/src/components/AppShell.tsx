import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Archive, LayoutDashboard, Link2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ScrollText, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/format";
import { Button } from "./ui/Button";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/vault", label: "Evidence Vault", icon: Archive },
  { to: "/custody", label: "Chain of Custody", icon: Link2 },
  { to: "/audit", label: "Audit Logs", icon: ScrollText },
];

const readCollapsed = () => { try { return localStorage.getItem("ev.sidebar") === "collapsed"; } catch { return false; } };

export function AppShell() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => { try { localStorage.setItem("ev.sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* ignore */ } }, [collapsed]);

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}${open ? " nav-open" : ""}`}>
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={18} aria-hidden /></span>
          <span className="brand-text">EvidenceVault</span>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link" title={collapsed ? label : undefined}>
              <Icon size={18} aria-hidden /><span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Button variant="ghost" className="collapse-btn" onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="foot-label">Collapse</span>
          </Button>
          <div className="profile">
            <span className="avatar" aria-hidden>{initials(user?.name ?? "")}</span>
            <span className="who"><b>{user?.name}</b><span>{user?.role}</span></span>
          </div>
          <Button variant="ghost" onClick={logout} title="Sign out"><LogOut size={18} /><span className="foot-label">Sign out</span></Button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden />
      <div className="main">
        <div className="topbar">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={18} /></Button>
          <span className="brand-mark"><ShieldCheck size={16} aria-hidden /></span><b>EvidenceVault</b>
        </div>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  );
}