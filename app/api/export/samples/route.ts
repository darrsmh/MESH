import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const SAMPLES_KEY = "seismic:samples";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const from = Number(req.nextUrl.searchParams.get("from")) || 0;
  const to   = Number(req.nextUrl.searchParams.get("to"))   || Infinity;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 5000, 50000);

  const items = await redis.lrange(SAMPLES_KEY, 0, limit - 1);
  const all = items
    .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
    .reverse();

  const samples = all.filter((s: { t: number }) => s.t >= from && s.t <= to);

  const header = "node_id,t,x,y,z,pga";
  const rows = samples.map(
    (s: { node_id: number; t: number; x: number; y: number; z: number; pga: number }) =>
      `${s.node_id},${s.t},${s.x},${s.y},${s.z},${s.pga.toFixed(6)}`
  );

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="seismic_samples_${Date.now()}.csv"`,
    },
  });
}
