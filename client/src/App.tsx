import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  List, 
  BarChart2, 
  ShieldAlert, 
  Network, 
  Terminal,
  Shield,
  CheckCircle2,
  CreditCard
} from 'lucide-react';
import PayTab          from './tabs/PayTab';
import OverviewTab     from './tabs/OverviewTab';
import TransactionsTab from './tabs/TransactionsTab';
import ModelsTab       from './tabs/ModelsTab';
import PatternsTab     from './tabs/PatternsTab';
import NetworkTab      from './tabs/NetworkTab';
import SimulatorTab    from './tabs/SimulatorTab';
import { initialModels, initialPatterns, getShapFactors, getShapFromReasons } from './data';
import { useBackend } from './hooks/useBackend';
import { updateThresholds } from './api';
import type { Transaction, ModelScore, FraudPattern, ShapFactor, AppStats, TabId, TxnType } from './types';
import type { BackendDecision } from './api';

const rand    = (min: number, max: number) => Math.random() * (max - min) + min;
const randInt = (min: number, max: number) => Math.floor(rand(min, max));

const TABS = [
  { id: 'pay',          label: 'Pay',                icon: <CreditCard size={16} /> },
  { id: 'overview',     label: 'Overview',           icon: <LayoutDashboard size={16} /> },
  { id: 'transactions', label: 'Live Transactions',  icon: <List size={16} /> },
  { id: 'models',       label: 'Model Scores',       icon: <BarChart2 size={16} /> },
  { id: 'patterns',     label: 'Pattern Detection',  icon: <ShieldAlert size={16} /> },
  { id: 'network',      label: 'Fraud Network',      icon: <Network size={16} /> },
  { id: 'simulator',    label: 'Simulator',          icon: <Terminal size={16} /> },
];

const App: React.FC = () => {
  const [activeTab,   setActiveTab]   = useState<TabId>('pay');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [models,       setModels]       = useState<ModelScore[]>(initialModels);
  const [patterns,     setPatterns]     = useState<FraudPattern[]>(initialPatterns);
  const [shapFactors,  setShapFactors]  = useState<ShapFactor[]>(getShapFactors('ALLOW'));
  const [thresholds,   setThresholds]   = useState({ friction: 0.30, block: 0.70 });
  const [lastInjectedTxn, setLastInjectedTxn] = useState<Transaction | null>(null);
  const [stats,        setStats]        = useState<AppStats>({ total: 0, blocked: 0, friction: 0, prauc: 0.913 });
  const [tps,          setTps]          = useState(24);
  const [latency,      setLatency]      = useState(42);
  const [lastDecision, setLastDecision] = useState<BackendDecision | null>(null);

  const backend = useBackend();

  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;

  // ── Update stats from backend overview when available ──
  useEffect(() => {
    if (backend.overview) {
      const ov = backend.overview;
      setStats(prev => ({
        total: ov.all_time.total || prev.total,
        blocked: ov.all_time.block || prev.blocked,
        friction: ov.all_time.friction || prev.friction,
        prauc: prev.prauc, // Keep the model's PR-AUC (not a dashboard metric)
      }));
      if (ov.window.avg_latency_ms > 0) {
        setLatency(Math.round(ov.window.avg_latency_ms));
      }
    }
  }, [backend.overview]);

  // ── Core function: add a transaction (backend or mock) ──
  const addTransaction = useCallback(async (
    type: TxnType = 'random',
    custom?: { vpa?: string; payee?: string; amount?: string; remark?: string },
  ) => {
    const { txn, backendDecision } = await backend.submitTransaction(
      type,
      thresholdsRef.current,
      custom,
    );

    setTransactions(prev => {
      const next = [txn, ...prev];
      return next.slice(0, 100);
    });
    setLastInjectedTxn(txn);

    setStats(prev => ({
      ...prev,
      total:   prev.total + 1,
      blocked: prev.blocked + (txn.decision === 'BLOCK'    ? 1 : 0),
      friction: prev.friction + (txn.decision === 'FRICTION' ? 1 : 0),
    }));

    // Update model scores from actual backend response
    if (backendDecision?.individual_scores) {
      const scores = backendDecision.individual_scores;
      setModels(prev => prev.map(m => {
        const key = m.key;
        const backendScore =
          key === 'rule' ? scores.rule :
          key === 'xgb'  ? scores.xgboost :
          key === 'gnn'  ? scores.gnn :
          key === 'lstm' ? scores.lstm :
          key === 'nlp'  ? scores.nlp : null;
        return backendScore !== null
          ? { ...m, score: parseFloat(backendScore.toFixed(3)) }
          : { ...m, score: parseFloat(Math.max(0, Math.min(1, m.score + rand(-0.08, 0.08))).toFixed(3)) };
      }));
      setLastDecision(backendDecision);

      // Use real reasons for SHAP display
      if (backendDecision.reasons && backendDecision.reasons.length > 0) {
        setShapFactors(getShapFromReasons(backendDecision.reasons));
      } else {
        setShapFactors(getShapFactors(txn.decision));
      }

      // Update latency from real response
      if (backendDecision.latency_ms > 0) {
        setLatency(backendDecision.latency_ms);
      }
    } else {
      // Mock mode — drift scores slightly
      setModels(prev => prev.map(m => ({
        ...m,
        score: parseFloat(Math.max(0, Math.min(1, m.score + rand(-0.08, 0.08))).toFixed(3)),
      })));
      setShapFactors(getShapFactors(txn.decision));
    }

    // Bump pattern count if applicable
    if (txn.pattern) {
      setPatterns(prev => prev.map(p =>
        p.name.replace(/ /g, '_') === txn.pattern ? { ...p, count: p.count + 1 } : p
      ));
    }
  }, [backend]);

  // Listen to recentTxns updates
  useEffect(() => {
    if (backend.isConnected && backend.recentTxns.length > 0) {
      setTransactions(prev => {
        const prevMap = new Map(prev.map(t => [t.id, t]));
        const merged = backend.recentTxns.map(rt => {
          const pt = prevMap.get(rt.id);
          if (pt) {
            return { 
              ...rt, 
              user: pt.user || rt.user, 
              payee: pt.payee || rt.payee, 
              amount: pt.amount || rt.amount,
              remark: pt.remark || rt.remark 
            };
          }
          return rt;
        });
        return merged;
      });
    }
  }, [backend.recentTxns, backend.isConnected]);

  // Seed initial data
  useEffect(() => {
    if (backend.isConnected || backend.checking) return;
    const seed: TxnType[] = ['legit','legit','legit','legit','refund','legit','legit','qr_swap','legit','legit','sim_swap','legit'];
    seed.forEach(t => addTransaction(t));
  }, [backend.isConnected, backend.checking, addTransaction]);

  // Live feed interval
  useEffect(() => {
    if (backend.isConnected) return;
    const id = setInterval(() => {
      if (Math.random() > 0.55) addTransaction('random');
    }, 2200);
    return () => clearInterval(id);
  }, [addTransaction, backend.isConnected]);

  // TPS jitter
  useEffect(() => {
    const id = setInterval(() => {
      if (!backend.isConnected) {
        setLatency(randInt(35, 78));
      }
      setTps(randInt(12, 46));
    }, 3000);
    return () => clearInterval(id);
  }, [backend.isConnected]);

  const handleThresholdChange = (key: 'friction' | 'block', val: number) => {
    setThresholds(prev => {
      const next = { ...prev, [key]: val };
      if (backend.isConnected) {
        updateThresholds(next.friction, next.block).catch(() => {});
      }
      return next;
    });
  };

  const lastResult = transactions[0] ?? null;

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: '#090d18', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(ellipse at 18% 18%, rgba(6,182,212,0.09) 0%, transparent 50%),
          radial-gradient(ellipse at 82% 82%, rgba(139,92,246,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 10%, rgba(16,185,129,0.04) 0%, transparent 45%)
        `
      }} />
      <div className="fixed inset-0 pointer-events-none bg-grid" style={{
        maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 78%)'
      }} />

      <div className="relative z-10 max-w-[1640px] mx-auto px-5 py-6">
        {/* ── Header ── */}
        <header className="flex items-center justify-between mb-7 pb-5 border-b border-white/[0.06] fade-up">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative w-11 h-11 rounded-xl flex items-center justify-center text-xl overflow-hidden shrink-0"
                 style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', boxShadow: '0 0 24px rgba(6,182,212,0.3)' }}>
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.18) 100%)' }} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{
                background: 'linear-gradient(90deg, #f1f5f9, #06b6d4)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                रक्षा-net
              </h1>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">Real-time Fraud Detection System</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Backend connection status */}
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold tracking-wide transition-all duration-500 ${
              backend.isConnected
                ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400'
                : 'border-amber-500/20 bg-amber-500/5 text-amber-400'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${backend.isConnected ? 'bg-emerald-400' : 'bg-amber-400'} pulse-dot`}
                   style={{ boxShadow: backend.isConnected ? '0 0 6px #10b981' : '0 0 6px #f59e0b' }} />
              {backend.checking ? 'DETECTING' : backend.isConnected ? 'ML PIPELINE CONNECTED' : 'LOCAL DEMO MODE'}
            </div>

            {/* System status */}
            <div className="hidden sm:flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot shadow-lg" style={{ boxShadow: '0 0 8px #10b981' }} />
              <span className="text-slate-300">SYSTEM OPERATIONAL</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-cyan-400">{latency}ms</span>
            </div>

            {/* TPS badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl text-xs">
              <span className="text-slate-500">TPS</span>
              <span className="font-mono font-bold text-slate-200">{tps}</span>
            </div>
          </div>
        </header>

        {/* ── Nav Tabs ── */}
        <nav className="flex gap-1.5 mb-7 overflow-x-auto pb-1 fade-up" style={{ animationDelay: '80ms' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium whitespace-nowrap
                          border transition-all duration-200 shrink-0
                          ${activeTab === tab.id
                            ? 'border-cyan-500/30 text-cyan-400'
                            : 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.1] hover:-translate-y-0.5'
                          }`}
              style={activeTab === tab.id ? {
                background: 'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.12))',
                boxShadow: '0 0 18px rgba(6,182,212,0.12)'
              } : {
                background: 'rgba(255,255,255,0.02)'
              }}
            >
              <span className="text-sm opacity-70">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── Tab Content ── */}
        <main>
          {activeTab === 'pay' && (
            <PayTab onViewDetails={() => setActiveTab('transactions')} />
          )}
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              tps={tps}
              transactions={transactions}
              models={models}
              shapFactors={shapFactors}
              thresholds={thresholds}
              onThresholdChange={handleThresholdChange}
            />
          )}
          {activeTab === 'transactions' && (
            <TransactionsTab transactions={transactions} />
          )}
          {activeTab === 'models' && (
            <ModelsTab models={models} transactions={transactions} />
          )}
          {activeTab === 'patterns' && (
            <PatternsTab patterns={patterns} transactions={transactions} />
          )}
          {activeTab === 'network' && (
            <NetworkTab transactions={transactions} />
          )}
          {activeTab === 'simulator' && (
            <SimulatorTab
              onInject={addTransaction}
              lastResult={lastInjectedTxn}
              lastDecision={lastDecision}
              isConnected={backend.isConnected}
            />
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="mt-10 pt-5 border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
          <span>© 2025 रक्षा-net · Real-time Fraud Detection System</span>
          <div className="flex items-center gap-4 font-mono">
            <span>PR-AUC <span className="text-emerald-500">{stats.prauc.toFixed(3)}</span></span>
            <span>Total <span className="text-slate-400">{stats.total.toLocaleString()}</span></span>
            <span className={backend.isConnected ? 'text-emerald-500/60' : 'text-amber-500/60'}>
              {backend.isConnected ? 'v2.4.1 · Connected' : 'v2.4.1 · Local'}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;
