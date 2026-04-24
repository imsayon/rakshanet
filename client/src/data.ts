import type { Transaction, FraudPattern, ModelScore, ShapFactor, TxnType, Decision } from './types';
import type { TransactionPayload, BackendDecision } from './api';

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max));

const VPAS = ['user@okaxis', 'raj@paytm', 'priya@ybl', 'arjun@okhdfcbank', 'divya@oksbi', 'amit@okaxis'];
const PAYEES = ['merchant@paytm', 'shop@ybl', 'cafe@okhdfcbank', 'kirana@oksbi', 'petrol@okaxis'];
const REMARKS = ['lunch', 'rent', 'groceries', 'fuel', 'movie tickets', 'EMI', 'coffee', ''];

// ── Mock transaction generator (fallback when backend is offline) ──

export function generateTxn(type: TxnType = 'random', thresholds = { friction: 0.30, block: 0.70 }): Transaction {
  let amount: number, score: number, remark: string, payee: string, pattern: string | null = null;

  switch (type) {
    case 'refund':
      amount = randInt(199, 1999);
      score = rand(0.75, 0.95);
      remark = 'refund processing fee';
      payee = 'scammer@okaxis';
      pattern = 'REFUND_SCAM';
      break;
    case 'qr_swap':
      amount = randInt(5000, 50000);
      score = rand(0.65, 0.90);
      remark = '';
      payee = 'fake_merchant@ybl';
      pattern = 'QR_SWAP';
      break;
    case 'sim_swap':
      amount = randInt(5000, 50000);
      score = rand(0.70, 0.98);
      remark = 'urgent transfer';
      payee = 'mule@ibl';
      pattern = 'SIM_SWAP_BURST';
      break;
    case 'mule':
      amount = randInt(1000, 10000);
      score = rand(0.55, 0.80);
      remark = '';
      payee = 'mule_hub@okaxis';
      pattern = 'MULE_NETWORK';
      break;
    case 'collect':
      amount = randInt(500, 5000);
      score = rand(0.60, 0.85);
      remark = 'collect request pending';
      payee = 'fraud@paytm';
      pattern = 'COLLECT_REQUEST_FRAUD';
      break;
    case 'legit':
      amount = randInt(50, 5000);
      score = rand(0.05, 0.25);
      remark = REMARKS[randInt(0, REMARKS.length)];
      payee = PAYEES[randInt(0, 2)];
      break;
    default:
      amount = randInt(100, 20000);
      score = Math.random();
      remark = REMARKS[randInt(0, REMARKS.length)];
      payee = PAYEES[randInt(0, PAYEES.length)];
  }

  let decision: Decision;
  if (score >= thresholds.block) decision = 'BLOCK';
  else if (score >= thresholds.friction) decision = 'FRICTION';
  else decision = 'ALLOW';

  return {
    id: 'TXN' + Date.now().toString(36).toUpperCase().slice(-4) + randInt(100, 999),
    user: VPAS[randInt(0, VPAS.length)],
    payee,
    amount,
    score: parseFloat(score.toFixed(3)),
    decision,
    pattern,
    remark,
    timestamp: new Date(),
    latency: randInt(35, 78),
  };
}

// ── Backend-compatible payload builder ──

/**
 * Build a TransactionPayload that the backend services expect.
 * Maps each fraud scenario to realistic field values the models can act on.
 */
export function buildPayload(
  type: TxnType,
  custom?: { vpa?: string; payee?: string; amount?: string; remark?: string },
): TransactionPayload {
  const now = new Date();
  const txnId = 'TXN' + now.getTime().toString(36).toUpperCase() + randInt(100, 999);
  const deviceId = 'dev_' + randInt(1000, 9999);

  // Use custom values if provided
  if (custom && custom.vpa && custom.payee && custom.amount) {
    return {
      txn_id: txnId,
      user_vpa: custom.vpa,
      payee_vpa: custom.payee,
      amount: parseFloat(custom.amount) || 1000,
      currency: 'INR',
      timestamp: now.toISOString(),
      device_id: deviceId,
      app_version: '4.2.1',
      remarks: custom.remark || '',
      biometrics: {
        pin_entry_duration_ms: randInt(1500, 3500),
        tap_pressure_avg: rand(0.4, 0.8),
        copy_paste_amount: false,
        app_bg_switch_count: 0,
      },
    };
  }

  // Scenario-specific payloads
  switch (type) {
    case 'refund':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: 'scammer@okaxis',
        amount: [199, 499, 999][randInt(0, 3)],
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: 'refund processing fee',
        biometrics: {
          pin_entry_duration_ms: randInt(800, 1500),
          tap_pressure_avg: rand(0.3, 0.5),
          copy_paste_amount: true,
          app_bg_switch_count: 3,
        },
      };

    case 'qr_swap':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: 'fake_merchant@ybl',
        amount: randInt(5000, 50000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: 'merchant payment',
        biometrics: {
          pin_entry_duration_ms: randInt(2000, 3500),
          tap_pressure_avg: rand(0.5, 0.7),
          copy_paste_amount: false,
          app_bg_switch_count: 0,
        },
        qr_metadata: {
          qr_id: 'QR_' + randInt(10000, 99999),
          merchant_name: 'RealStore',   // mismatch with payee_vpa
        },
      };

    case 'sim_swap':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: 'mule@ibl',
        amount: randInt(10000, 50000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: 'new_device_' + randInt(1, 99),
        app_version: '4.2.1',
        remarks: 'urgent transfer',
        biometrics: {
          pin_entry_duration_ms: randInt(500, 1000),
          tap_pressure_avg: rand(0.2, 0.4),
          copy_paste_amount: false,
          app_bg_switch_count: 5,
        },
      };

    case 'mule':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: 'mule_hub@okaxis',
        amount: randInt(2000, 15000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: '',
        biometrics: {
          pin_entry_duration_ms: randInt(1500, 2500),
          tap_pressure_avg: rand(0.5, 0.7),
          copy_paste_amount: false,
          app_bg_switch_count: 1,
        },
      };

    case 'collect':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: 'fraud@paytm',
        amount: randInt(500, 5000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: 'collect request pending',
        biometrics: {
          pin_entry_duration_ms: randInt(300, 700),
          tap_pressure_avg: rand(0.3, 0.5),
          copy_paste_amount: false,
          app_bg_switch_count: 2,
        },
      };

    case 'legit':
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: PAYEES[randInt(0, PAYEES.length)],
        amount: randInt(50, 5000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: REMARKS[randInt(0, REMARKS.length)],
        biometrics: {
          pin_entry_duration_ms: randInt(2000, 3500),
          tap_pressure_avg: rand(0.5, 0.8),
          copy_paste_amount: false,
          app_bg_switch_count: 0,
        },
      };

    default: // random
      return {
        txn_id: txnId,
        user_vpa: VPAS[randInt(0, VPAS.length)],
        payee_vpa: PAYEES[randInt(0, PAYEES.length)],
        amount: randInt(100, 20000),
        currency: 'INR',
        timestamp: now.toISOString(),
        device_id: deviceId,
        app_version: '4.2.1',
        remarks: REMARKS[randInt(0, REMARKS.length)],
        biometrics: {
          pin_entry_duration_ms: randInt(1500, 3500),
          tap_pressure_avg: rand(0.4, 0.8),
          copy_paste_amount: Math.random() > 0.85,
          app_bg_switch_count: randInt(0, 3),
        },
      };
  }
}

// ── Backend response → Client Transaction mapper ──

/**
 * Map a backend decision + original payload into the client Transaction type.
 */
export function mapBackendDecision(decision: BackendDecision, payload: TransactionPayload): Transaction {
  return {
    id: decision.txn_id,
    user: decision.user_vpa || payload.user_vpa,
    payee: decision.payee_vpa || payload.payee_vpa,
    amount: payload.amount,
    score: decision.score,
    decision: decision.decision,
    pattern: decision.pattern === 'NONE' ? null : decision.pattern,
    remark: payload.remarks,
    timestamp: new Date(),
    latency: decision.latency_ms,
    individualScores: decision.individual_scores,
    reasons: decision.reasons,
  };
}

// ── Static data (unchanged) ──

export const initialModels: ModelScore[] = [
  { name: 'Rule Engine', key: 'rule', score: 0.23, color: '#94a3b8', latency: 2 },
  { name: 'XGBoost',    key: 'xgb',  score: 0.67, color: '#3b82f6', latency: 12 },
  { name: 'GNN',        key: 'gnn',  score: 0.45, color: '#f97316', latency: 18 },
  { name: 'LSTM',       key: 'lstm', score: 0.38, color: '#8b5cf6', latency: 15 },
  { name: 'NLP',        key: 'nlp',  score: 0.82, color: '#06b6d4', latency: 8 },
];

export const initialPatterns: FraudPattern[] = [
  { name: 'REFUND SCAM',      icon: 'ShieldAlert', count: 0, color: '#f43f5e', desc: 'Fake refund processing fee requests' },
  { name: 'QR SWAP',          icon: 'QrCode', count: 0,  color: '#f59e0b', desc: 'Replaced QR codes at merchant points' },
  { name: 'SIM SWAP BURST',   icon: 'Smartphone', count: 0,  color: '#8b5cf6', desc: 'Sudden high-value transfers post SIM change' },
  { name: 'MULE NETWORK',     icon: 'Network', count: 0,  color: '#f43f5e', desc: 'Layered accounts laundering funds' },
  { name: 'COLLECT REQUEST',  icon: 'ArrowDownCircle', count: 0,  color: '#f59e0b', desc: 'Fraudulent collect/pull payment requests' },
  { name: 'ACCOUNT TAKEOVER', icon: 'UserX', count: 0,  color: '#06b6d4', desc: 'Credential stuffing & session hijack' },
];

export function getShapFactors(decision: Decision): ShapFactor[] {
  if (decision === 'ALLOW') {
    return [
      { label: 'known_payee',       value: -0.12, color: '#10b981' },
      { label: 'normal_hour',       value: -0.09, color: '#10b981' },
      { label: 'typical_amount',    value: -0.07, color: '#10b981' },
      { label: 'device_trusted',    value: -0.06, color: '#10b981' },
      { label: 'low_velocity',      value: -0.04, color: '#10b981' },
    ];
  }
  return [
    { label: 'nlp_score > 0.6',   value: 0.18, color: '#06b6d4' },
    { label: 'copy_paste_amount', value: 0.15, color: '#f59e0b' },
    { label: 'new_payee_flag',    value: 0.12, color: '#8b5cf6' },
    { label: 'amount_deviation',  value: 0.09, color: '#3b82f6' },
    { label: 'pin_entry_fast',    value: 0.07, color: '#f43f5e' },
  ];
}

/**
 * Build SHAP-style factors from real backend reasons when available.
 */
export function getShapFromReasons(reasons: string[]): ShapFactor[] {
  const REASON_MAP: Record<string, { label: string; value: number; color: string }> = {
    rule_violation:              { label: 'rule_violation',       value: 0.22, color: '#94a3b8' },
    anomalous_tabular_features:  { label: 'tabular_anomaly',     value: 0.18, color: '#3b82f6' },
    suspicious_graph_pattern:    { label: 'graph_anomaly',       value: 0.16, color: '#f97316' },
    unusual_transaction_sequence:{ label: 'sequence_anomaly',     value: 0.14, color: '#8b5cf6' },
    fraud_remark_detected:       { label: 'fraud_remark',        value: 0.20, color: '#06b6d4' },
    high_velocity:               { label: 'high_velocity',       value: 0.15, color: '#f43f5e' },
    amount_deviation:            { label: 'amount_deviation',    value: 0.12, color: '#3b82f6' },
    new_payee:                   { label: 'new_payee_flag',      value: 0.10, color: '#8b5cf6' },
    copy_paste_amount:           { label: 'copy_paste_amount',   value: 0.17, color: '#f59e0b' },
    qr_merchant_mismatch:        { label: 'qr_mismatch',        value: 0.25, color: '#f43f5e' },
  };

  const factors: ShapFactor[] = [];
  for (const reason of reasons) {
    const mapped = REASON_MAP[reason];
    if (mapped) {
      factors.push(mapped);
    } else {
      factors.push({ label: reason, value: 0.08, color: '#94a3b8' });
    }
  }

  // If no reasons, show safe factors
  if (factors.length === 0) {
    return getShapFactors('ALLOW');
  }

  return factors.sort((a, b) => b.value - a.value).slice(0, 5);
}
