import React from 'react';
import {
  ClipboardList,
  TreePine,
  Network,
  Brain,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Type,
  Zap,
  UserPlus,
  Moon,
  Timer,
  Banknote,
  BarChart,
  Smartphone,
  Download,
  Shuffle
} from 'lucide-react';

/* ── Plain-English reason translations ── */
export const REASONS_MAP: Record<string, string> = {
  copy_paste_amount:   'Amount was pasted, not typed manually',
  refund_keyword:      'Remarks contain suspicious refund language',
  high_velocity:       'Multiple transactions in a short time window',
  new_payee:           'First ever payment to this recipient',
  odd_hour:            'Transaction at an unusual hour',
  pin_entry_fast:      'PIN entered unusually fast (possible automation)',
  high_amount:         'Amount significantly higher than usual',
  amount_deviation:    'Amount deviates from your typical payments',
  device_shared:       'Multiple users detected on this device',
  payee_high_inbound:  'Recipient receiving from many people rapidly',
  graph_anomaly:       'Suspicious pattern in payment network',
  sequence_anomaly:    'Unusual behavior compared to your history',
};

export const PATTERN_MAP: Record<
  string,
  { label: string; color: string; description: string }
> = {
  REFUND_SCAM:           { label: 'Refund Scam',          color: '#FF4757', description: 'Fraudster posing as support agent' },
  QR_SWAP:               { label: 'QR Swap',              color: '#FF4757', description: 'QR code replaced with fraudulent one' },
  MULE_NETWORK:          { label: 'Mule Network',         color: '#FF4757', description: 'Money laundering via middlemen' },
  COLLECT_REQUEST_FRAUD: { label: 'Collect Fraud',        color: '#F5A623', description: 'Fake payment request disguised as receipt' },
  SIM_SWAP_BURST:        { label: 'SIM Swap',             color: '#FF4757', description: 'Account accessed after SIM compromise' },
  GENERIC_FRAUD:         { label: 'Suspicious Activity',  color: '#F5A623', description: 'Multiple fraud indicators detected' },
};

/* ── Decision thresholds (client preview only) ── */
export const DEFAULT_THRESHOLDS = {
  friction: 0.40,
  block:    0.55,
};

/* ── Model metadata ── */
export const MODEL_NAMES: Record<string, { label: string; icon: React.ReactNode }> = {
  rule:    { label: 'Rule Engine',  icon: <ClipboardList size={14} className="inline" /> },
  xgboost: { label: 'XGBoost',     icon: <TreePine size={14} className="inline" /> },
  gnn:     { label: 'GNN',         icon: <Network size={14} className="inline" /> },
  lstm:    { label: 'LSTM',        icon: <Brain size={14} className="inline" /> },
  nlp:     { label: 'NLP',         icon: <MessageSquare size={14} className="inline" /> },
};

/* ── Pre-built demo scenarios ── */
export const DEMO_SCENARIOS = [
  {
    label: 'Refund Scam',
    icon: <ShieldAlert size={20} className="text-block" />,
    description: 'Fraudster posing as customer support',
    payload: {
      user_vpa: 'victim@okaxis',
      payee_vpa: 'scammer@ybl',
      amount: 49999,
      remarks: 'refund processing fee urgent KYC',
      biometrics: {
        pin_entry_duration_ms: 450,
        tap_pressure_avg: 0.9,
        copy_paste_amount: true,
      },
    },
    expectedDecision: 'BLOCK' as const,
  },
  {
    label: 'Normal Payment',
    icon: <CheckCircle2 size={20} className="text-allow" />,
    description: 'Regular lunch payment',
    payload: {
      user_vpa: 'rahul@okaxis',
      payee_vpa: 'zomato@icici',
      amount: 250,
      remarks: 'lunch order',
      biometrics: {
        pin_entry_duration_ms: 1800,
        tap_pressure_avg: 0.6,
        copy_paste_amount: false,
      },
    },
    expectedDecision: 'ALLOW' as const,
  },
  {
    label: 'QR Swap Attack',
    icon: <AlertTriangle size={20} className="text-friction" />,
    description: 'Fraudster replaced shop QR code',
    payload: {
      user_vpa: 'customer@okhdfc',
      payee_vpa: 'mule123@ybl',
      amount: 1500,
      remarks: 'shop payment',
      biometrics: {
        pin_entry_duration_ms: 1200,
        tap_pressure_avg: 0.65,
        copy_paste_amount: false,
      },
    },
    expectedDecision: 'FRICTION' as const,
  },
  {
    label: 'Mule Network',
    icon: <Network size={20} className="text-block" />,
    description: 'Money laundering via mule account',
    payload: {
      user_vpa: 'unknowing_sender@okaxis',
      payee_vpa: 'mule_account@paytm',
      amount: 9999,
      remarks: 'transfer',
      biometrics: {
        pin_entry_duration_ms: 2000,
        tap_pressure_avg: 0.7,
        copy_paste_amount: false,
      },
    },
    expectedDecision: 'BLOCK' as const,
  },
] as const;

/* ── Reason icon map ── */
export const REASON_ICONS: Record<string, React.ReactNode> = {
  copy_paste_amount:   <ClipboardList size={14} className="inline" />,
  refund_keyword:      <Type size={14} className="inline" />,
  high_velocity:       <Zap size={14} className="inline" />,
  new_payee:           <UserPlus size={14} className="inline" />,
  odd_hour:            <Moon size={14} className="inline" />,
  pin_entry_fast:      <Timer size={14} className="inline" />,
  high_amount:         <Banknote size={14} className="inline" />,
  amount_deviation:    <BarChart size={14} className="inline" />,
  device_shared:       <Smartphone size={14} className="inline" />,
  payee_high_inbound:  <Download size={14} className="inline" />,
  graph_anomaly:       <Network size={14} className="inline" />,
  sequence_anomaly:    <Shuffle size={14} className="inline" />,
};
