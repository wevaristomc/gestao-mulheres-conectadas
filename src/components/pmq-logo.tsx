import { useState } from "react";
import { cn } from "@/lib/utils";

const LOGO_URL =
  "https://yqvocpnvunaprpmhlswn.supabase.co/storage/v1/object/public/marca/logo-pmq-horizontal.png";

type Props = {
  className?: string;
  fallbackClassName?: string;
  /** Height in px. Width scales automatically. */
  height?: number;
};

/** Logo oficial do Programa Manuel Querino. Fallback: texto institucional. */
export function PMQLogo({ className, fallbackClassName, height = 32 }: Props) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        className={cn(
          "font-semibold leading-tight tracking-tight",
          fallbackClassName ?? className,
        )}
      >
        Programa Manuel Querino
      </span>
    );
  }
  return (
    <img
      src={LOGO_URL}
      alt="Programa Manuel Querino"
      onError={() => setBroken(true)}
      style={{ height }}
      className={cn("h-8 w-auto object-contain", className)}
    />
  );
}