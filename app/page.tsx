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

// --- Types matching /api/dashboard response --------------------
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

// --- Constants --------------------------------------------------
const NODE_COLORS  = ["#2a78d6", "#1baf7a", "#eda100", "#e34948"];
const THRESHOLD_G  = 0.02;
const POLL_MS      = 2000;        // fetch interval
const CANVAS_PTS   = 750;        // number of data points shown per channel
const CANVAS_H     = 96;         // canvas height px

// --- Utility -----------------------------------------------------
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

// --- Seismogram Canvas Component -------------------------------
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

// --- Main Page ---------------------------------------------------
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

  // --- Fetch loop ------------------------------------------------
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

  // --- Clock & uptime ---------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      setClockStr(new Date().toLocaleTimeString("en-PH", { hour12: false }));
      setUptime(formatUptime(startMs));
    }, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  // --- Derived stats ----------------------------------------------
  const nodes      = data?.nodes ?? [1,2,3,4].map((id) => ({
    id, online: false, last_seen_ms: null, last_pga: null, window_pga: 0,
  }));
  const nodesOnline = nodes.filter((n) => n.online).length;
  const latestPGA   = Math.max(...nodes.map((n) => n.window_pga ?? 0));
  const totalAlerts = data?.alerts.length ?? 0;

  // Split samples by node for individual canvases
  const samplesByNode = (nodeId: number) =>
    (data?.samples ?? []).filter((s) => s.node_id === nodeId);

  // --- Render -----------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 lg:px-8">
        <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="blink inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-sky-300">Mesh seismic network</p>
                <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
                  Seismic Detection Dashboard
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <div className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1.5">
                {uptime}
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1.5">
                {clockStr || "--:--:--"}
              </div>
              <div
                className={`rounded-full px-2.5 py-1.5 font-medium ${
                  error ? "border border-red-500/50 bg-red-500/10 text-red-300" : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                }`}
              >
                {error ? "Offline" : "Live"}
              </div>
            </div>
          </div>
        </header>

        {activeAlert && (
          <div className="alert-pulse mb-6 rounded-2xl border border-red-500/60 bg-gradient-to-r from-red-950/70 via-red-900/50 to-slate-900/80 p-4 shadow-lg shadow-red-950/40">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-xl text-red-300">!</div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-200">
                  Earthquake detected
                </p>
                <p className="mt-1 text-xl font-bold text-white">
                  MMI {pgaToMMI(activeAlert.network_pga)}
                </p>
                <p className="mt-1 text-sm text-red-100/80">
                  Network PGA: <span className="font-semibold text-white">{activeAlert.network_pga.toFixed(4)} g</span>
                  <span className="mx-2 text-red-300/70">•</span>
                  {activeAlert.votes}/{activeAlert.total_nodes} nodes confirmed
                  <span className="mx-2 text-red-300/70">•</span>
                  {formatTime(activeAlert.received_at)}
                  <span className="mx-2 text-red-300/70">•</span>
                  {(activeAlert.received_at - activeAlert.alert_ts_ms).toFixed(0)} ms latency
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            {
              label: "Network PGA",
              value: latestPGA.toFixed(4) + " g",
              accent: latestPGA >= THRESHOLD_G ? "from-red-500/20 via-red-500/5 to-slate-900" : "from-emerald-500/20 via-emerald-500/5 to-slate-900",
              color: latestPGA >= THRESHOLD_G ? "text-red-300" : "text-emerald-300",
              badge: latestPGA >= THRESHOLD_G ? "bg-red-500/10 text-red-200" : "bg-emerald-500/10 text-emerald-200",
            },
            {
              label: "Sample Rate",
              value: "250 Hz",
              accent: "from-sky-500/20 via-sky-500/5 to-slate-900",
              color: "text-sky-300",
              badge: "bg-sky-500/10 text-sky-200",
            },
            {
              label: "Nodes Online",
              value: `${nodesOnline} / 4`,
              accent: nodesOnline === 4 ? "from-emerald-500/20 via-emerald-500/5 to-slate-900" : "from-amber-500/20 via-amber-500/5 to-slate-900",
              color: nodesOnline === 4 ? "text-emerald-300" : "text-amber-300",
              badge: nodesOnline === 4 ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200",
            },
            {
              label: "Events Today",
              value: String(totalAlerts),
              accent: "from-violet-500/20 via-violet-500/5 to-slate-900",
              color: "text-violet-300",
              badge: "bg-violet-500/10 text-violet-200",
            },
            {
              label: "Uptime",
              value: uptime,
              accent: "from-slate-500/20 via-slate-500/5 to-slate-900",
              color: "text-slate-100",
              badge: "bg-slate-500/10 text-slate-200",
            },
          ].map(({ label, value, accent, color, badge }) => (
            <div key={label} className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br ${accent} p-3 shadow-lg shadow-slate-950/25`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_45%)]" />
              <div className="relative">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-300">{label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${badge}`}>live</span>
                </div>
                <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
          <span className="font-medium text-slate-200">Y-axis scale:</span>
          {[0.05, 0.1, 0.5, 1.0].map((v) => (
            <button
              key={v}
              onClick={() => setScale(v)}
              className={`rounded-full border px-2.5 py-1.5 transition ${
                scale === v
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
              }`}
            >
              ±{v} g
            </button>
          ))}
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Threshold <span className="text-red-300">0.02 g</span>
          </span>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300">
          <span className="font-medium text-slate-200">Export CSV:</span>
          {[
            { label: "1 min",  ms: 60_000 },
            { label: "5 min",  ms: 300_000 },
            { label: "15 min", ms: 900_000 },
            { label: "30 min", ms: 1_800_000 },
            { label: "1 hr",   ms: 3_600_000 },
            { label: "All",    ms: 0 },
          ].map(({ label, ms }) => (
            <button
              key={label}
              onClick={() => {
                const now = Date.now();
                const from = ms === 0 ? 0 : now - ms;
                window.open(`/api/export/samples?from=${from}&to=${now}`, "_blank");
              }}
              className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1.5 transition hover:border-sky-500 hover:bg-sky-500/10 hover:text-sky-200"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-6 space-y-3">
          {[1, 2, 3, 4].map((id, idx) => {
            const node = nodes.find((n) => n.id === id);
            const color = NODE_COLORS[idx];
            const nodePGA = node?.window_pga ?? 0;
            const alerting = nodePGA >= THRESHOLD_G;

            return (
              <div
                key={id}
                className={`overflow-hidden rounded-2xl border shadow-lg shadow-slate-950/20 transition ${
                  alerting ? "border-red-500/60 bg-slate-900" : "border-slate-800 bg-slate-900/80"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-sm font-medium text-white">Node {id}</span>
                    <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500">ESP32 + ADXL355</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        node?.online ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {node?.online ? "online" : "offline"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                    <span>
                      PGA <span className={`tabular-nums font-semibold ${alerting ? "text-red-300" : "text-white"}`}>{nodePGA.toFixed(4)} g</span>
                    </span>
                    <span>
                      Last seen <span className="text-slate-400">{node?.last_seen_ms ? `${Math.round((Date.now() - node.last_seen_ms) / 1000)} s ago` : "—"}</span>
                    </span>
                    {alerting && <span className="font-semibold text-red-300">Above threshold</span>}
                  </div>
                </div>

                {loading ? (
                  <div className="flex h-24 items-center justify-center text-xs text-slate-500">Waiting for data...</div>
                ) : (
                  <SeismoCanvas nodeId={id} color={color} samples={samplesByNode(id)} scale={scale} />
                )}
              </div>
            );
          })}
        </div>

        <div className="mb-6 flex justify-between px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
          <span>-{((CANVAS_PTS / 250) * 4).toFixed(0)} s</span>
          <span>-{((CANVAS_PTS / 250) * 3).toFixed(0)} s</span>
          <span>-{((CANVAS_PTS / 250) * 2).toFixed(0)} s</span>
          <span>-{((CANVAS_PTS / 250) * 1).toFixed(0)} s</span>
          <span className="text-slate-300">now</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl shadow-slate-950/20">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Earthquake Alert Log</h2>
            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {totalAlerts} event{totalAlerts !== 1 ? "s" : ""}
            </span>
          </div>

          {totalAlerts === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No earthquakes detected yet — system monitoring...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-950/60 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    {['Received', 'Network PGA', 'MMI', 'Votes', 'Latency', 'Gateway'].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left font-medium">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.alerts ?? []).map((a) => (
                    <tr key={a.id} className="border-t border-slate-800/80 transition hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDateTime(a.received_at)}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">
                        <span
                          className={
                            a.network_pga >= 0.1 ? "text-red-300" : a.network_pga >= 0.05 ? "text-orange-300" : "text-amber-300"
                          }
                        >
                          {a.network_pga.toFixed(4)} g
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{pgaToMMI(a.network_pga)}</td>
                      <td className="px-4 py-3 text-emerald-300 tabular-nums">{a.votes}/{a.total_nodes}</td>
                      <td className="px-4 py-3 text-slate-300 tabular-nums">{(a.received_at - a.alert_ts_ms).toFixed(0)} ms</td>
                      <td className="px-4 py-3 text-slate-400">GW {a.gateway_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="mt-6 pb-4 text-center text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Refreshes every {POLL_MS / 1000}s · Threshold 0.02g · M-of-N 3/4 consensus
        </footer>
      </div>
    </div>
  );
}
