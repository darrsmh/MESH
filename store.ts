// lib/store.ts
// ================================================================
// Vercel KV (Redis) data layer for the seismic dashboard.
//
// Keys used:
//   seismic:samples   — rolling ring buffer of latest AccelData
//   seismic:alerts    — list of confirmed earthquake events
//   seismic:status    — hash of per-node health metadata
//
// Set these env vars in Vercel → Settings → Environment Variables:
//   KV_REST_API_URL    (auto-set when you add Vercel KV storage)
//   KV_REST_API_TOKEN  (auto-set)
//   VERCEL_API_KEY     (your shared secret, same as in config.h)
// ================================================================

import { kv } from "@vercel/kv";

// ── Key names ──────────────────────────────────────────────────
export const SAMPLES_KEY = "seismic:samples";
export const ALERTS_KEY  = "seismic:alerts";
export const STATUS_KEY  = "seismic:status";

// ── Storage limits ─────────────────────────────────────────────
export const MAX_SAMPLES = 5000;   // ~20 s at 250 Hz across 4 nodes
export const MAX_ALERTS  = 200;    // keep last 200 earthquake events

// ── Types ──────────────────────────────────────────────────────
export interface Sample {
  node_id : number;
  t       : number;   // timestamp_ms from ESP32
  x       : number;   // acceleration g
  y       : number;
  z       : number;
  pga     : number;   // pre-computed vector magnitude (g)
}

export interface Alert {
  id           : string;   // random UUID
  gateway_id   : number;
  votes        : number;
  network_pga  : number;   // RMS PGA across voting nodes
  alert_ts_ms  : number;   // timestamp from ESP32
  total_nodes  : number;
  received_at  : number;   // server Unix ms (Date.now())
}

export interface NodeStatus {
  id          : number;
  online      : boolean;
  last_seen_ms: number | null;
  last_pga    : number | null;
}

// ── Sample helpers ─────────────────────────────────────────────

/** Append a batch of samples; keep only the most recent MAX_SAMPLES. */
export async function appendSamples(samples: Sample[]): Promise<void> {
  if (!samples.length) return;
  const pipeline = kv.pipeline();
  for (const s of samples) {
    pipeline.rpush(SAMPLES_KEY, JSON.stringify(s));
  }
  pipeline.ltrim(SAMPLES_KEY, -MAX_SAMPLES, -1);
  await pipeline.exec();
}

/** Fetch the most recent `n` samples for the seismogram chart. */
export async function getRecentSamples(n = 1000): Promise<Sample[]> {
  const raw = await kv.lrange<string>(SAMPLES_KEY, -n, -1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

// ── Alert helpers ──────────────────────────────────────────────

/** Push a new earthquake alert to the front of the list. */
export async function pushAlert(alert: Alert): Promise<void> {
  await kv.lpush(ALERTS_KEY, JSON.stringify(alert));
  await kv.ltrim(ALERTS_KEY, 0, MAX_ALERTS - 1);
}

/** Get all stored alerts, newest first. */
export async function getAlerts(): Promise<Alert[]> {
  const raw = await kv.lrange<string>(ALERTS_KEY, 0, MAX_ALERTS - 1);
  return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

// ── Node status helpers ────────────────────────────────────────

/** Update last-seen timestamp and PGA for a node. */
export async function setNodeStatus(
  node_id : number,
  pga     : number
): Promise<void> {
  await kv.hset(STATUS_KEY, {
    [`node_${node_id}_ts`] : Date.now(),
    [`node_${node_id}_pga`]: pga,
  });
}

/** Retrieve raw hash of all node fields. */
export async function getAllNodeStatus(): Promise<Record<string, string>> {
  return (await kv.hgetall<Record<string, string>>(STATUS_KEY)) ?? {};
}

/** Build typed NodeStatus[] for nodes 1–4. */
export async function getNodeStatuses(): Promise<NodeStatus[]> {
  const raw = await getAllNodeStatus();
  return [1, 2, 3, 4].map((id) => {
    const ts  = raw[`node_${id}_ts`]  ? Number(raw[`node_${id}_ts`])  : null;
    const pga = raw[`node_${id}_pga`] ? Number(raw[`node_${id}_pga`]) : null;
    return {
      id,
      online      : ts !== null && Date.now() - ts < 60_000, // seen in last 60 s
      last_seen_ms: ts,
      last_pga    : pga,
    };
  });
}
