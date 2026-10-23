"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Car, Gauge, Users } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/input";
import { PlateTag } from "@/components/orders/status-badge";
import { api, qs } from "@/lib/api-client";
import { cn, formatDate, relativeDay } from "@/lib/utils";

export interface VehicleRow {
  id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  voltage: string;
  fleetNumber: string | null;
  clientId: number;
  clientName: string;
  orders: number;
  lastVisit: string | null;
  lastMileage: number | null;
}

export function VehiclesView({
  vehicles: initial,
  initialQuery,
}: {
  vehicles: VehicleRow[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const term = q.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const data = await api.get<{ rows: VehicleRow[] }>(`/api/vehicles${qs({ q: term })}`);
        setRows(data.rows);
        window.history.replaceState(null, "", `/veiculos${qs({ q })}`);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <>
      <PageHeader
        title="Veículos"
        subtitle={`${rows.length} veículo(s) cadastrado(s) — busca por placa, marca, modelo ou cliente`}
      />

      <Card padded={false}>
        <div className="border-b border-line p-3 sm:p-4">
          <SearchInput
            autoFocus
            placeholder="Buscar por placa (ABC1D23), marca, modelo ou cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Car className="h-5 w-5" />}
            title={q ? "Nenhum veículo encontrado" : "Nenhum veículo cadastrado"}
            description={
              q
                ? "Confira a placa digitada ou busque pelo nome do cliente."
                : "Os veículos são cadastrados junto com o cliente, ou na hora de abrir uma OS."
            }
          />
        ) : (
          <div className={cn("overflow-x-auto scrollbar-thin transition-opacity", loading && "opacity-55")}>
            <table className="table-base min-w-[48rem]">
              <thead>
                <tr>
                  <th className="w-28">Placa</th>
                  <th>Veículo</th>
                  <th className="w-52">Cliente</th>
                  <th className="w-20">Sistema</th>
                  <th className="w-28 text-right">Última KM</th>
                  <th className="w-16 text-center">OS</th>
                  <th className="w-36">Última visita</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="cursor-pointer" onClick={() => router.push(`/veiculos/${v.id}`)}>
                    <td>
                      <PlateTag plate={v.plate} />
                    </td>
                    <td>
                      <p className="font-medium text-slate-800">
                        {[v.brand, v.model].filter(Boolean).join(" ") || "Veículo não identificado"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[v.year, v.color, v.fleetNumber && `frota ${v.fleetNumber}`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 truncate text-slate-700">
                        <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {v.clientName}
                      </span>
                    </td>
                    <td>
                      <Badge tone="neutral">{v.voltage}</Badge>
                    </td>
                    <td className="tnum text-right text-slate-700">
                      {v.lastMileage ? (
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3.5 w-3.5 text-slate-400" />
                          {v.lastMileage.toLocaleString("pt-BR")}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="tnum text-center font-semibold text-slate-700">{v.orders}</td>
                    <td className="whitespace-nowrap text-slate-600">
                      {v.lastVisit ? (
                        <>
                          {formatDate(v.lastVisit)}
                          <span className="ml-1 text-[11px] text-slate-400">
                            ({relativeDay(v.lastVisit)})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">nunca</span>
                      )}
                    </td>
                    <td>
                      <ArrowRight className="h-4 w-4 text-slate-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
