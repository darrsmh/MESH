// app/api/ingest/samples/route.ts
// ================================================================
// Receives batched acceleration samples from each sensor node.
// Called by WiFiCloud::uploadPending() on the ESP32 every 5 s.
//
// Request body (JSON):
//   { node_id: 1, fw_version: "1.0.0",
//     samples: [{ t, x, y, z }, ...] }
//
// Auth: X-Api-Key header must match VERCEL_API_KEY env var.
// ================================================================

import { NextRequest, NextResponse } from "next/server";
import { appendSamples, setNodeStatus, Sample } from "@/lib/store";

const API_KEY = process.env.VERCEL_API_KEY ?? "";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  // --- Authentication ---------------------------------------------
  if (!API_KEY || req.headers.get("x-api-key") !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ------------------------------------------------
  let body: {
    node_id    : number;
    fw_version?: string;
    samples    : Array<{ t: number; x: number; y: number; z: number }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { node_id, samples } = body;

  if (!node_id || !Array.isArray(samples) || samples.length === 0) {
    return NextResponse.json({ error: "Missing node_id or samples" }, { status: 400 });
  }

  // --- Compute PGA and tag each sample with node_id ---------------
  const tagged: Sample[] = samples.map((s) => ({
    node_id,
    t  : s.t,
    x  : s.x,
    y  : s.y,
    z  : s.z,
    pga: Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2),
  }));

  const latestPGA = tagged[tagged.length - 1].pga;

  // --- Persist to Vercel KV ---------------------------------------
  await Promise.all([
    appendSamples(tagged),
    setNodeStatus(node_id, latestPGA),
  ]);

  return NextResponse.json(
    { ok: true, stored: tagged.length },
    { status: 201 }
  );
}
