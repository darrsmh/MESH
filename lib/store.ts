import { redis } from "./redis";

export type Sample = {
  node_id: number;
  t: number;
  x: number;
  y: number;
  z: number;
  pga: number;
};

export type Alert = {
  id: string;
  gateway_id: number;
  votes: number;
  network_pga: number;
  alert_ts_ms: number;
  total_nodes: number;
  received_at: number;
};

export type NodeStatus = {
  id: number;
  online: boolean;
  last_seen_ms: number | null;
  last_pga: number | null;
};

const SAMPLES_KEY = "seismic:samples";
const ALERTS_KEY = "seismic:alerts";
const NODE_KEY_PREFIX = "seismic:node:";
const MAX_SAMPLES = 5000;
const MAX_ALERTS = 50;
const TOTAL_NODES = 4;
const NODE_OFFLINE_MS = 60_000;

export async function appendSamples(batch: Sample[]) {
  if (batch.length === 0) return;
  await redis.lpush(SAMPLES_KEY, ...batch.map((s) => JSON.stringify(s)));
  await redis.ltrim(SAMPLES_KEY, 0, MAX_SAMPLES - 1);
}

export async function setNodeStatus(nodeId: number, latestPGA: number) {
  const key = `${NODE_KEY_PREFIX}${nodeId}`;
  await redis.hset(key, {
    id: nodeId,
    last_seen_ms: Date.now(),
    last_pga: latestPGA,
  });
  await redis.expire(key, 300);
}

export async function getRecentSamples(limit = 1500): Promise<Sample[]> {
  const items = await redis.lrange(SAMPLES_KEY, 0, limit - 1);
  return items
    .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
    .reverse();
}

export async function getAlerts(): Promise<Alert[]> {
  const items = await redis.lrange(ALERTS_KEY, 0, MAX_ALERTS - 1);
  return items
    .map((item) => (typeof item === "string" ? JSON.parse(item) : item))
    .sort((a, b) => b.received_at - a.received_at);
}

export async function getNodeStatuses(): Promise<NodeStatus[]> {
  const pipeline = redis.pipeline();
  for (let id = 1; id <= TOTAL_NODES; id++) {
    pipeline.hgetall(`${NODE_KEY_PREFIX}${id}`);
  }
  const results = await pipeline.exec<Record<string, string>[]>();

  const statuses: NodeStatus[] = [];
  for (let i = 0; i < results.length; i++) {
    const data = results[i];
    if (data && Object.keys(data).length > 0) {
      const lastSeen = Number(data.last_seen_ms);
      statuses.push({
        id: i + 1,
        online: lastSeen > 0 && Date.now() - lastSeen < NODE_OFFLINE_MS,
        last_seen_ms: lastSeen || null,
        last_pga: data.last_pga ? Number(data.last_pga) : null,
      });
    }
  }
  return statuses;
}

export async function pushAlert(alert: Alert) {
  await redis.lpush(ALERTS_KEY, JSON.stringify(alert));
  await redis.ltrim(ALERTS_KEY, 0, MAX_ALERTS - 1);
}
