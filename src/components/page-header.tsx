import type { ReactNode } from "react";
import { HelpPoint } from "@/components/ajuda/help-point";

export function PageHeader({
  title,
  description,
  actions,
  helpId,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  helpId?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          {title}
          {helpId ? <HelpPoint id={helpId} size={16} /> : null}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PlaceholderPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center rounded-lg border border-dashed bg-card">
      <div className="max-w-md p-8 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}