import { statsRepo, currentMonthPeriod } from "@/server/db/stats";
import { ok, withAuth } from "@/server/api";

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  const period = currentMonthPeriod();

  const data = statsRepo.financial({
    q: url.searchParams.get("q") ?? "",
    financialStatus: url.searchParams.get("financialStatus") ?? "TODAS",
    from: url.searchParams.get("from") || null,
    to: url.searchParams.get("to") || null,
    limit: Number(url.searchParams.get("limit") ?? 300),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });

  return ok({
    rows: data.rows,
    totals: {
      ...data.totals,
      receivedThisMonthCents: statsRepo.dashboard().receivedThisMonth,
      periodFrom: url.searchParams.get("from") || period.from,
      periodTo: url.searchParams.get("to") || period.to,
    },
  });
});
