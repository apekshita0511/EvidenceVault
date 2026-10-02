import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, crumbs, actions }: Props) {
  return (
    <header className="page-header">
      <div>
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <Fragment key={c.label}>
                {i > 0 && <ChevronRight size={12} aria-hidden />}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}