"use client";

import { Badge } from "@/components/ui/card";
import { cn, formatMoney } from "@/lib/utils";
import {
  FIN_LABEL,
  FIN_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type FinancialStatus,
  type OrderStatus,
} from "@/lib/types";

export function StatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <Badge tone={STATUS_TONE[status]} dot className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function FinancialBadge({
  status,
  paidCents,
  className,
}: {
  status: FinancialStatus;
  paidCents?: number;
  className?: string;
}) {
  return (
    <Badge tone={FIN_TONE[status]} className={className}>
      {FIN_LABEL[status]}
      {status === "PARCIAL" && paidCents !== undefined
        ? ` · ${formatMoney(paidCents)}`
        : null}
    </Badge>
  );
}

export function PlateTag({ plate, className }: { plate: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5",
        "font-mono text-[11px] font-bold tracking-wide text-slate-800 uppercase",
        className,
      )}
    >
      {plate}
    </span>
  );
}
