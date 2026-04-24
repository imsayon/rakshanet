/**
 * RakshaNet API Client
 *
 * Centralized API layer for communicating with backend microservices:
 *  - Decision Engine  (POST /score)         — Direct ML scoring
 *  - Txn Ingestion    (POST /v1/transaction) — Full pipeline flow
 *  - Dashboard API    (GET  /api/*)          — Stats & history
 */

// ── Base URLs (proxied via Vite in dev) ──
const DECISION_ENGINE = '/engine';
const INGESTION        = '/ingest';
const DASHBOARD        = '/dash';

// ── Types matching backend response shapes ──

export interface DecisionResponse {
  txn_id: string;
  user_vpa: string;
  payee_vpa: string;
  score: number;
  decision: 'ALLOW' | 'FRICTION' | 'BLOCK';
  reasons: string[];
  pattern: string | null;
  latency_ms: number;
  individual_scores: {
    rule: number;
    xgboost: number;
    gnn: number;
    lstm: number;
    nlp: number;
  };
}

// Alias for backward compatibility
export type BackendDecision = DecisionResponse;

export interface BackendOverview {
  window_minutes: number;
  window: {
    total: number;
    allow: number;
    friction: number;
    block: number;
    block_rate_percent: number;
    friction_rate_percent: number;
    avg_score: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
  };
  all_time: {
    total: number;
    allow: number;
    friction: number;
    block: number;
  };
}

export interface BackendRecentRow {
  txn_id: string;
  score: number;
  decision: 'ALLOW' | 'FRICTION' | 'BLOCK';
  reasons: string[];
  pattern: string | null;
  latency_ms: number;
  timestamp: string;
  user_vpa?: string;
  payee_vpa?: string;
  amount?: number;
}

export interface TransactionPayload {
  txn_id: string;
  user_vpa: string;
  payee_vpa: string;
  amount: number;
  currency: string;
  timestamp: string;
  device_id: string;
  app_version: string;
  remarks: string;
  biometrics: {
    pin_entry_duration_ms: number;
    tap_pressure_avg: number;
    copy_paste_amount: boolean;
    app_bg_switch_count: number;
  };
  qr_metadata?: {
    qr_id: string;
    merchant_name: string;
  };
}

// ── Helpers ──

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function parsePythonStringifiedJson(str: any): any {
  if (typeof str !== 'string') return str;
  try {
    const jsonStr = str.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false');
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[API] fetchRecent error:', err);
    return [];
  }
}

// ── Public API ──

/**
 * Check if a backend service is reachable.
 * Validates that the response is actual JSON from our service,
 * not an HTML error page from the Vite proxy.
 */
export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(`${baseUrl}/health`);
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return false;
    const body = await resp.json();
    return body?.status === 'ok' || body?.status === 'loading';
  } catch {
    return false;
  }
}

/**
 * Check if the primary backend services are reachable.
 */
export async function checkBackendConnectivity(): Promise<{
  decisionEngine: boolean;
  dashboard: boolean;
  ingestion: boolean;
}> {
  const [decisionEngine, dashboard, ingestion] = await Promise.all([
    checkHealth(DECISION_ENGINE),
    checkHealth(DASHBOARD),
    checkHealth(INGESTION),
  ]);
  return { decisionEngine, dashboard, ingestion };
}

/**
 * Score a transaction directly via the Decision Engine.
 * This calls all 5 ML models in parallel and returns ensemble result.
 */
export async function scoreTransaction(payload: TransactionPayload): Promise<BackendDecision> {
  const resp = await fetchWithTimeout(`${DECISION_ENGINE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txn_id: payload.txn_id,
      user_vpa: payload.user_vpa,
      payee_vpa: payload.payee_vpa,
      amount: payload.amount,
      remarks: payload.remarks,
      device_id: payload.device_id,
      timestamp: payload.timestamp,
      biometrics: payload.biometrics,
      qr_mismatch: payload.qr_metadata ? true : false,
      new_payee_flag: 1,
      txn_count_1h: 1,
      hour_of_day: new Date().getHours(),
      day_of_week: new Date().getDay(),
      txn_amount_sum_1h: payload.amount,
      device_user_count: 1,
      amount_deviation: 0,
      payee_receive_count_1h: 0,
      pin_entry_duration_ms: payload.biometrics.pin_entry_duration_ms,
      tap_pressure_avg: payload.biometrics.tap_pressure_avg,
      copy_paste_amount: payload.biometrics.copy_paste_amount ? 1 : 0,
      app_bg_switch_count: payload.biometrics.app_bg_switch_count,
    }),
  });
  if (!resp.ok) throw new Error(`Decision Engine returned ${resp.status}`);
  return resp.json();
}

/**
 * Ingest a transaction through the full pipeline (Kafka → Feature Engine → Decision Engine).
 */
export async function ingestTransaction(payload: TransactionPayload): Promise<{ status: string; txn_id: string }> {
  const resp = await fetchWithTimeout(`${INGESTION}/v1/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Ingestion returned ${resp.status}`);
  return resp.json();
}

/**
 * Fetch a decision by ID (polling).
 */
export async function fetchDecision(txnId: string): Promise<DecisionResponse> {
  const resp = await fetchWithTimeout(`${DECISION_ENGINE}/decision/${txnId}`);
  if (!resp.ok) throw new Error(`Decision Engine returned ${resp.status}`);
  const data = await resp.json();
  
  if (data.error) return data; // Return error object for polling loop

  return {
    txn_id: data.txn_id,
    score: data.score ? parseFloat(data.score) : 0,
    decision: data.decision as 'ALLOW' | 'FRICTION' | 'BLOCK',
    reasons: parsePythonStringifiedJson(data.reasons) || [],
    pattern: data.pattern === 'None' || !data.pattern ? null : data.pattern,
    latency_ms: data.latency_ms ? parseInt(data.latency_ms, 10) : 0,
    individual_scores: parsePythonStringifiedJson(data.individual_scores) || {
      rule: 0.1, xgboost: 0.1, gnn: 0.1, lstm: 0.1, nlp: 0.1
    }
  } as DecisionResponse;
}

/**
 * Fetch dashboard overview stats.
 */
export async function fetchOverview(minutes = 60): Promise<BackendOverview> {
  const resp = await fetchWithTimeout(`${DASHBOARD}/api/overview?minutes=${minutes}`);
  if (!resp.ok) throw new Error(`Dashboard overview returned ${resp.status}`);
  return resp.json();
}

/**
 * Fetch recent decisions.
 */
export async function fetchRecent(limit = 25): Promise<BackendRecentRow[]> {
  const resp = await fetchWithTimeout(`${DASHBOARD}/api/recent?limit=${limit}`);
  if (!resp.ok) throw new Error(`Dashboard recent returned ${resp.status}`);
  return resp.json();
}

/**
 * Update thresholds dynamically.
 */
export async function updateThresholds(friction: number, block: number): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(`${DECISION_ENGINE}/config/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friction, block }),
    });
    return resp.ok;
  } catch (err) {
    console.error('[API] updateThresholds error:', err);
    return false;
  }
}

/**
 * Fetch decision timeseries data.
 */
export async function fetchTimeseries(minutes = 60) {
  const resp = await fetchWithTimeout(`${DASHBOARD}/api/timeseries?minutes=${minutes}`);
  if (!resp.ok) throw new Error(`Dashboard timeseries returned ${resp.status}`);
  return resp.json();
}

export const api = {
  submitTransaction: ingestTransaction,
  getDecision: fetchDecision,
  getOverview: fetchOverview,
  getRecent: fetchRecent,
  getHealth: checkBackendConnectivity,
  updateThresholds: updateThresholds,
};
