export type Decision = 'ALLOW' | 'FRICTION' | 'BLOCK';

export interface Transaction {
  id: string;
  user: string;
  payee: string;
  amount: number;
  score: number;
  decision: Decision;
  pattern: string | null;
  remark: string;
  timestamp: Date;
  latency: number;
  /** Individual model scores from the backend (null when using mock data) */
  individualScores?: {
    rule: number;
    xgboost: number;
    gnn: number;
    lstm: number;
    nlp: number;
  } | null;
  /** Reasons array from ensemble service */
  reasons?: string[];
}

export interface ModelScore {
  name: string;
  score: number;
  color: string;
  latency: number;
  key: string;
}

export interface FraudPattern {
  name: string;
  icon: string;
  count: number;
  color: string;
  desc: string;
}

export interface ShapFactor {
  label: string;
  value: number;
  color: string;
}

export interface AppStats {
  total: number;
  blocked: number;
  friction: number;
  prauc: number;
}

export type TabId = 'pay' | 'overview' | 'transactions' | 'models' | 'patterns' | 'network' | 'simulator';
export type TxnType = 'random' | 'legit' | 'refund' | 'qr_swap' | 'sim_swap' | 'mule' | 'collect';
