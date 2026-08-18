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

const MAX_SAMPLES = 5000;
const MAX_ALERTS = 50;

let sampleStore: Sample[] = [];
let alertStore: Alert[] = [];
let nodeStatusStore: Record<number, NodeStatus> = {};

export function appendSamples(batch: Sample[]) {
  sampleStore.push(...batch);
  if (sampleStore.length > MAX_SAMPLES) {
    sampleStore = sampleStore.slice(-MAX_SAMPLES);
  }
}

export function setNodeStatus(nodeId: number, latestPGA: number) {
  nodeStatusStore[nodeId] = {
    id: nodeId,
    online: true,
    last_seen_ms: Date.now(),
    last_pga: latestPGA,
  };
}

export function getRecentSamples(limit = 1500): Sample[] {
  return [...sampleStore].slice(-limit);
}

export function getAlerts(): Alert[] {
  return [...alertStore]
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, MAX_ALERTS);
}

export function getNodeStatuses(): NodeStatus[] {
  return Object.values(nodeStatusStore)
    .sort((a, b) => a.id - b.id)
    .map((node) => ({
      ...node,
      online: node.last_seen_ms !== null && Date.now() - node.last_seen_ms < 60000,
    }));
}

export function pushAlert(alert: Alert) {
  alertStore.unshift(alert);
  if (alertStore.length > MAX_ALERTS) {
    alertStore = alertStore.slice(0, MAX_ALERTS);
  }
}

export function getDashboardState() {
  return {
    nodes: Object.values(nodeStatusStore),
    recentAlerts: alertStore,
  };
}

export function clearMockData() {
  sampleStore = [];
  alertStore = [];
  nodeStatusStore = {};
}