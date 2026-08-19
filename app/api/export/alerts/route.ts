import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const ALERTS_KEY = "seismic:alerts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);

  const items = await redis.lrange(ALERTS_KEY, 0, limit - 1);
  const alerts = items
    .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
    .sort((a: { received_at: number }, b: { received_at: number }) => b.received_at - a.received_at);

  const header = "id,gateway_id,votes,network_pga,alert_ts_ms,total_nodes,received_at";
  const rows = alerts.map(
    (a: {
      id: string;
      gateway_id: number;
      votes: number;
      network_pga: number;
      alert_ts_ms: number;
      total_nodes: number;
      received_at: number;
    }) =>
      `${a.id},${a.gateway_id},${a.votes},${a.network_pga},${a.alert_ts_ms},${a.total_nodes},${a.received_at}`
  );

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="seismic_alerts_${Date.now()}.csv"`,
    },
  });
}
