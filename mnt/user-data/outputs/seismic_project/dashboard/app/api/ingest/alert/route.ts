// app/api/ingest/alert/route.ts
// ================================================================
// Receives a confirmed earthquake alert from the gateway node.
// Called by WiFiCloud::sendAlert() immediately after consensus.
//
// Request body (JSON):
//   { gateway_id, votes, network_pga, alert_ts_ms,
//     total_nodes, threshold_g }
//
// Optionally forwards to a push-notification webhook
// (set ALERT_WEBHOOK_URL in Vercel env vars, e.g. ntfy.sh).
// ================================================================

import { NextRequest, NextResponse } from "next/server";
import { pushAlert, Alert } from "@/lib/store";
import { randomUUID } from "crypto";

const API_KEY     = process.env.VERCEL_API_KEY     ?? "";
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL  ?? "";

function pgaToMMI(p: number): string {
  if (p < 0.003) return "I";
  if (p < 0.01)  return "II";
  if (p < 0.02)  return "III";
  if (p < 0.05)  return "IV";
  if (p < 0.1)   return "V";
  if (p < 0.3)   return "VI";
  if (p < 0.6)   return "VII";
  return "VIII+";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  // ── Authentication ─────────────────────────────────────────
  if (!API_KEY || req.headers.get("x-api-key") !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    gateway_id  : number;
    votes       : number;
    network_pga : number;
    alert_ts_ms : number;
    total_nodes : number;
    threshold_g : number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Build & store alert record ─────────────────────────────
  const alert: Alert = {
    id          : randomUUID(),
    gateway_id  : body.gateway_id,
    votes       : body.votes,
    network_pga : body.network_pga,
    alert_ts_ms : body.alert_ts_ms,
    total_nodes : body.total_nodes,
    received_at : Date.now(),
  };

  await pushAlert(alert);

  console.warn(
    `[ALERT] id=${alert.id} gw=${body.gateway_id} ` +
    `pga=${body.network_pga.toFixed(4)}g ` +
    `votes=${body.votes}/${body.total_nodes} ` +
    `mmi=${pgaToMMI(body.network_pga)}`
  );

  // ── Optional push notification (ntfy.sh / Twilio / etc.) ──
  if (WEBHOOK_URL) {
    try {
      await fetch(WEBHOOK_URL, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "Title"       : "⚠️ Earthquake Detected",
          "Priority"    : "urgent",
          "Tags"        : "warning,philippines",
        },
        body: JSON.stringify({
          title  : "⚠️ Earthquake Detected",
          message:
            `MMI ${pgaToMMI(body.network_pga)} · ` +
            `PGA ${body.network_pga.toFixed(4)} g · ` +
            `${body.votes}/${body.total_nodes} nodes confirmed`,
          priority: 5,
        }),
      });
    } catch (e) {
      console.error("[ALERT] Webhook delivery failed:", e);
    }
  }

  return NextResponse.json({ ok: true, id: alert.id }, { status: 201 });
}
