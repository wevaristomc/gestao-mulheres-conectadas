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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <span className="min-w-0 break-words">{title}</span>
          {helpId ? <HelpPoint id={helpId} size={16} /> : null}
        </h1>
        {description ? (
          <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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