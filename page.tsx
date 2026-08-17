"use client";

// ================================================================
// app/page.tsx  —  Live Seismogram Dashboard
// ================================================================
// Layout:
//   Top bar     — title + last-refresh + live indicator
//   Alert banner — flashes red when earthquake confirmed
//   Stats row   — network PGA, sample rate, nodes online, events
//   Seismogram  — one canvas per node, 250 Hz rolling waveform
//   Alert log   — table of all confirmed earthquake events
// ================================================================

import {
  useEffect, useRef, useState, useCallback, type FC,
} from "react";

// ── Types matching /api/dashboard response ─────────────────────
interface Sample {
  node_id: number; t: number; x: number; y: number; z: number; pga: number;
}
interface Alert {
  id: string; gateway_id: number; votes: number; network_pga: number;
  alert_ts_ms: number; total_nodes: number; received_at: number;
}
interface NodeInfo {
  id: number; online: boolean;
  last_seen_ms: number | null; last_pga: number | null; window_pga: number;
}
interface DashData { samples: Sample[]; alerts: Alert[]; nodes: NodeInfo[]; }

// ── Constants ──────────────────────────────────────────────────
const NODE_COLORS  = ["#2a78d6", "#1baf7a", "#eda100", "#e34948"];
const THRESHOLD_G  = 0.02;
const POLL_MS      = 2000;        // fetch interval
const CANVAS_PTS   = 750;        // number of data points shown per channel
const CANVAS_H     = 96;         // canvas height px

// ── Utility ────────────────────────────────────────────────────
function pgaToMMI(p: number): string {
  if (p < 0.003) return "I";   if (p < 0.01)  return "II";
  if (p < 0.02)  return "III"; if (p < 0.05)  return "IV";
  if (p < 0.1)   return "V";   if (p < 0.3)   return "VI";
  if (p < 0.6)   return "VII"; return "VIII+";
}
function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString("en-PH", { hour12: false });
}
function formatDateTime(ms: number) {
  return new Date(ms).toLocaleString("en-PH", { hour12: false });
}
function formatUptime(startMs: number) {
  const s  = Math.floor((Date.now() - startMs) / 1000);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

// ── Seismogram Canvas Component ────────────────────────────────
// Receives a rolling buffer of PGA values and redraws on change.
interface SeismoProps {
  nodeId  : number;
  color   : string;
  samples : Sample[];   // already filtered for this node
  scale   : number;     // y-axis ±scale in g
}

const SeismoCanvas: FC<SeismoProps> = ({ nodeId, color, samples, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const w   = cv.offsetWidth || 640;
    const h   = CANVAS_H;
    cv.width  = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const isDark = window.matchMedia("(prefers-color-scheme:dark)").matches;
    const bg     = isDark ? "#111827" : "#f9fafb";
    const grid   = isDark ? "#1f2937" : "#e5e7eb";
    const zero   = isDark ? "#374151" : "#d1d5db";

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Gridlines (horizontal)
    ctx.strokeStyle = grid;
    ctx.lineWidth   = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Zero axis
    const mid = h / 2;
    ctx.strokeStyle = zero;
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

    // Threshold lines ±0.02 g
    const thrY = (THRESHOLD_G / scale) * mid;
    ctx.strokeStyle = "#e34948";
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, mid - thrY); ctx.lineTo(w, mid - thrY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, mid + thrY); ctx.lineTo(w, mid + thrY); ctx.stroke();
    ctx.setLineDash([]);

    // Extract PGA values, keep last CANVAS_PTS
    const pgaVals = samples.map((s) => s.pga);
    const pts     = pgaVals.slice(-CANVAS_PTS);
    if (pts.length < 2) return;

    const step = w / (CANVAS_PTS - 1);

    // Fill area under waveform
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = i * step;
      const y = mid - Math.min(v / scale, 1) * mid;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo((pts.length - 1) * step, mid);
    ctx.lineTo(0, mid);
    ctx.closePath();
    ctx.fillStyle = color + "22";
    ctx.fill();

    // Waveform line
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = "round";
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = i * step;
      const y = mid - Math.min(Math.max(v / scale, -1), 1) * mid;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Highlight segments above threshold in brighter stroke
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    let inAlert = false;
    pts.forEach((v, i) => {
      if (v >= THRESHOLD_G) {
        const x = i * step;
        const y = mid - (v / scale) * mid;
        if (!inAlert) { ctx.moveTo(x, y); inAlert = true; }
        else            ctx.lineTo(x, y);
      } else { inAlert = false; }
    });
    ctx.stroke();

    // Axis labels
    ctx.fillStyle  = isDark ? "#6b7280" : "#9ca3af";
    ctx.font       = "10px monospace";
    ctx.textAlign  = "left";
    ctx.fillText(`+${scale.toFixed(2)} g`, 4, 11);
    ctx.fillText("0",                       4, mid + 3);
    ctx.fillText(`−${scale.toFixed(2)} g`, 4, h - 3);

    // Node label
    ctx.textAlign  = "right";
    ctx.fillStyle  = color;
    ctx.font       = "11px monospace";
    ctx.fillText(`Node ${nodeId}`, w - 4, 13);

  }, [samples, scale, color, nodeId]);

  return (
    <canvas
      ref={canvasRef}
      className="seismo-canvas"
      role="img"
      aria-label={`Live seismogram waveform for Node ${nodeId}`}
    />
  );
};

// ── Main Page ──────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,       setData]       = useState<DashData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [scale,      setScale]      = useState(0.1);
  const [startMs]                   = useState(Date.now);
  const [uptime,     setUptime]     = useState("00:00:00");
  const [clockStr,   setClockStr]   = useState("");
  const [activeAlert, setActive]    = useState<Alert | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Fetch loop ───────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d: DashData = await res.json();
      setData(d);
      setError(null);
      // Check for fresh alert (received in last 30 s)
      if (d.alerts.length > 0) {
        const newest = d.alerts[0];
        if (Date.now() - newest.received_at < 30_000) {
          setActive(newest);
          clearTimeout(alertTimer.current);
          alertTimer.current = setTimeout(() => setActive(null), 30_000);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Clock & uptime ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setClockStr(new Date().toLocaleTimeString("en-PH", { hour12: false }));
      setUptime(formatUptime(startMs));
    }, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  // ── Derived stats ────────────────────────────────────────────
  const nodes      = data?.nodes ?? [1,2,3,4].map((id) => ({
    id, online: false, last_seen_ms: null, last_pga: null, window_pga: 0,
  }));
  const nodesOnline = nodes.filter((n) => n.online).length;
  const latestPGA   = Math.max(...nodes.map((n) => n.window_pga ?? 0));
  const totalAlerts = data?.alerts.length ?? 0;

  // Split samples by node for individual canvases
  const samplesByNode = (nodeId: number) =>
    (data?.samples ?? []).filter((s) => s.node_id === nodeId);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 font-mono text-sm">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Live blink dot */}
          <span className="blink inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <div>
            <h1 className="text-base font-medium text-white tracking-tight">
              Seismic Detection Dashboard
            </h1>
            <p className="text-xs text-gray-500">
              LilyGO T3-S3 · SX1262 LoRa · 250 Hz · 4-Node Array · Philippines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>⏱ {uptime}</span>
          <span>🕐 {clockStr}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            error ? "bg-red-900/50 text-red-400" : "bg-emerald-900/40 text-emerald-400"
          }`}>
            {error ? "⚠ OFFLINE" : "● LIVE"}
          </span>
        </div>
      </div>

      {/* ── Active alert banner ───────────────────────────────── */}
      {activeAlert && (
        <div className="alert-pulse mb-5 flex items-start gap-3 rounded-xl border border-red-500/60 bg-red-950/50 px-4 py-3">
          <span className="text-2xl mt-0.5">⚠️</span>
          <div>
            <p className="font-bold text-red-300 text-base">
              EARTHQUAKE DETECTED — MMI {pgaToMMI(activeAlert.network_pga)}
            </p>
            <p className="text-red-400/80 text-xs mt-0.5">
              Network PGA: <b>{activeAlert.network_pga.toFixed(4)} g</b>
              &nbsp;·&nbsp; {activeAlert.votes}/{activeAlert.total_nodes} nodes confirmed
              &nbsp;·&nbsp; Received: {formatTime(activeAlert.received_at)}
              &nbsp;·&nbsp; End-to-end latency: {(activeAlert.received_at - activeAlert.alert_ts_ms).toFixed(0)} ms
            </p>
          </div>
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          {
            label: "Network PGA",
            value: latestPGA.toFixed(4) + " g",
            color: latestPGA >= THRESHOLD_G ? "text-red-400" : "text-emerald-400",
          },
          { label: "Sample Rate",   value: "250 Hz",                  color: "text-sky-400" },
          {
            label: "Nodes Online",
            value: `${nodesOnline} / 4`,
            color: nodesOnline === 4 ? "text-emerald-400" : "text-amber-400",
          },
          { label: "Events Today",  value: String(totalAlerts),        color: "text-white" },
          { label: "Uptime",        value: uptime,                     color: "text-gray-300" },
        ].map(({ label, value, color }) => (
          <div key={label}
            className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Y-scale control ───────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
        <span>Y-axis scale:</span>
        {[0.05, 0.1, 0.5, 1.0].map((v) => (
          <button
            key={v}
            onClick={() => setScale(v)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${
              scale === v
                ? "border-sky-500 bg-sky-900/40 text-sky-300"
                : "border-gray-700 hover:border-gray-500 text-gray-400"
            }`}
          >
            ±{v} g
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-600">
          Threshold: <span className="text-red-400">— — 0.02 g</span>
        </span>
      </div>

      {/* ── Node status + Seismogram channels ─────────────────── */}
      <div className="flex flex-col gap-2 mb-5">
        {[1, 2, 3, 4].map((id, idx) => {
          const node    = nodes.find((n) => n.id === id);
          const color   = NODE_COLORS[idx];
          const nodePGA = node?.window_pga ?? 0;
          const alerting = nodePGA >= THRESHOLD_G;

          return (
            <div key={id}
              className={`rounded-xl border overflow-hidden transition-colors ${
                alerting
                  ? "border-red-500/60 bg-gray-900"
                  : "border-gray-800 bg-gray-900/60"
              }`}
            >
              {/* Channel header */}
              <div className="flex items-center justify-between px-3 py-2
                              border-b border-gray-800 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: color }} />
                  <span className="font-medium text-white text-xs">Node {id}</span>
                  <span className="text-gray-500 text-[10px]">
                    · ESP32-S3 + ADXL355 + SX1262
                  </span>
                  <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded ${
                    node?.online
                      ? "bg-emerald-900/40 text-emerald-400"
                      : "bg-gray-800 text-gray-500"
                  }`}>
                    {node?.online ? "● online" : "○ offline"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-gray-400">
                  <span>
                    PGA:&nbsp;
                    <span className={`font-medium tabular-nums ${
                      alerting ? "text-red-400" : "text-white"
                    }`}>
                      {nodePGA.toFixed(4)} g
                    </span>
                  </span>
                  <span>
                    Last seen:&nbsp;
                    {node?.last_seen_ms
                      ? `${Math.round((Date.now() - node.last_seen_ms) / 1000)} s ago`
                      : "—"}
                  </span>
                  {alerting && (
                    <span className="text-red-400 font-bold alert-pulse">
                      ⚠ ABOVE THRESHOLD
                    </span>
                  )}
                </div>
              </div>

              {/* Canvas seismogram */}
              {loading ? (
                <div className="h-24 flex items-center justify-center text-gray-600 text-xs">
                  Waiting for data...
                </div>
              ) : (
                <SeismoCanvas
                  nodeId={id}
                  color={color}
                  samples={samplesByNode(id)}
                  scale={scale}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Time ruler ───────────────────────────────────────── */}
      <div className="flex justify-between text-[10px] text-gray-600 px-2 -mt-1 mb-5">
        <span>−{((CANVAS_PTS / 250) * 4).toFixed(0)} s</span>
        <span>−{((CANVAS_PTS / 250) * 3).toFixed(0)} s</span>
        <span>−{((CANVAS_PTS / 250) * 2).toFixed(0)} s</span>
        <span>−{((CANVAS_PTS / 250) * 1).toFixed(0)} s</span>
        <span className="text-gray-400">now</span>
      </div>

      {/* ── Alert history table ───────────────────────────────── */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3
                        border-b border-gray-800">
          <h2 className="text-xs font-medium text-white">Earthquake Alert Log</h2>
          <span className="text-[10px] text-gray-500">
            {totalAlerts} event{totalAlerts !== 1 ? "s" : ""} stored
          </span>
        </div>

        {totalAlerts === 0 ? (
          <p className="text-center text-gray-600 text-xs py-8">
            No earthquakes detected yet — system monitoring...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wide
                               border-b border-gray-800">
                  {["Received", "Network PGA", "MMI", "Votes", "Latency", "Gateway"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.alerts ?? []).map((a) => (
                  <tr key={a.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-300 whitespace-nowrap">
                      {formatDateTime(a.received_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium tabular-nums">
                      <span className={
                        a.network_pga >= 0.1  ? "text-red-400"
                        : a.network_pga >= 0.05 ? "text-orange-400"
                        : "text-amber-400"
                      }>
                        {a.network_pga.toFixed(4)} g
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-white">
                      {pgaToMMI(a.network_pga)}
                    </td>
                    <td className="px-4 py-2.5 text-emerald-400 tabular-nums">
                      {a.votes}/{a.total_nodes}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                      {(a.received_at - a.alert_ts_ms).toFixed(0)} ms
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      GW {a.gateway_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <p className="text-center text-[10px] text-gray-700 mt-4">
        Refreshes every {POLL_MS / 1000} s · Threshold {THRESHOLD_G} g ·
        M-of-N 3/4 consensus · Data stored in Vercel KV
      </p>

    </div>
  );
}
