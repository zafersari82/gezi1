import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Başlığın altında, bölümün ne işe yaradığını anlatan kısa açıklama. */
  lead?: string;
  /** Başlığın sağındaki eylemler veya arama kutusu. */
  children?: ReactNode;
}

export function PageHeader({ title, lead, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {lead !== undefined && <p className="lead">{lead}</p>}
      </div>
      {children}
    </header>
  );
}
