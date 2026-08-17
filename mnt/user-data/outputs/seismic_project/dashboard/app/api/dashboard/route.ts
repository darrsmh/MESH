// app/api/dashboard/route.ts
// ================================================================
// Public read endpoint — no auth required.
// Returns the latest seismogram samples, alert history,
// and per-node online status for the live dashboard.
//
// Polled by the frontend every 2 seconds via setInterval.
// ================================================================

import { NextResponse } from "next/server";
import { getRecentSamples, getAlerts, getNodeStatuses } from "@/lib/store";

export const dynamic   = "force-dynamic"; // always fresh
export const revalidate = 0;

export async function GET() {
  try {
    const [samples, alerts, nodes] = await Promise.all([
      getRecentSamples(1500),  // ~6 s per node at 250 Hz
      getAlerts(),
      getNodeStatuses(),
    ]);

    // Compute per-node max PGA over the current window for colour coding
    const pgaByNode: Record<number, number> = {};
    for (const s of samples) {
      if (!pgaByNode[s.node_id] || s.pga > pgaByNode[s.node_id]) {
        pgaByNode[s.node_id] = s.pga;
      }
    }

    return NextResponse.json({
      samples,
      alerts,
      nodes : nodes.map((n) => ({
        ...n,
        window_pga: pgaByNode[n.id] ?? 0,
      })),
    });
  } catch (err) {
    console.error("[dashboard/route]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
