import React, { useState, useRef, useCallback } from 'react';
import { Panel, PanelHeader } from '../components/Panel';
import type { TxnType, Transaction } from '../types';
import type { BackendDecision } from '../api';
import { 
  CheckCircle2, 
  ShieldAlert, 
  QrCode, 
  Smartphone, 
  Network, 
  ArrowDownCircle, 
  Cpu,
  Send,
  Edit3,
  Target,
  Loader2,
  Play,
  Square
} from 'lucide-react';

interface SimulatorTabProps {
  onInject: (type: TxnType, custom?: { vpa?: string; payee?: string; amount?: string; remark?: string }) => void;
  lastResult: Transaction | null;
  lastDecision: BackendDecision | null;
  isConnected: boolean;
}

const SCENARIOS: { type: TxnType; icon: React.ReactNode; label: string; desc: string; color: string; risk: 'Low' | 'Medium' | 'High' | 'Critical' }[] = [
  { type: 'legit',    icon: <CheckCircle2 size={18} />, label: 'Legit P2P',        desc: 'Normal peer-to-peer transfer between known accounts', color: '#10b981', risk: 'Low' },
  { type: 'refund',   icon: <ShieldAlert size={18} />,  label: 'Refund Scam',      desc: 'Fake refund fee request to phishing endpoint',       color: '#f59e0b', risk: 'High' },
  { type: 'qr_swap',  icon: <QrCode size={18} />,       label: 'QR Code Swap',    desc: 'Replaced merchant QR code with attacker address',    color: '#f59e0b', risk: 'High' },
  { type: 'sim_swap', icon: <Smartphone size={18} />,   label: 'SIM Swap Burst',  desc: 'High-value burst after SIM card replacement',        color: '#f43f5e', risk: 'Critical' },
  { type: 'mule',     icon: <Network size={18} />,      label: 'Mule Network',    desc: 'Layered money mule laundering chain',                color: '#f43f5e', risk: 'Critical' },
  { type: 'collect',  icon: <ArrowDownCircle size={18} />, label: 'Collect Fraud',   desc: 'Fraudulent UPI collect/pull request',               color: '#8b5cf6', risk: 'Medium' },
];

// ── Demo sequence for live presentation ──
const DEMO_SEQUENCE: { type: TxnType; label: string }[] = [
  { type: 'legit',    label: 'Normal P2P' },
  { type: 'legit',    label: 'Normal P2P' },
  { type: 'legit',    label: 'Normal P2P' },
  { type: 'refund',   label: '⚠ Refund Scam' },
  { type: 'sim_swap', label: '🚨 SIM Swap Burst' },
  { type: 'mule',     label: '🚨 Mule Network' },
  { type: 'collect',  label: '⚠ Collect Fraud' },
  { type: 'legit',    label: 'Normal P2P' },
];

const ScoreRing: React.FC<{ score: number; decision: string; pattern?: string | null }> = ({ score, decision, pattern }) => {
  const color = decision === 'BLOCK' ? '#f43f5e' : decision === 'FRICTION' ? '#f59e0b' : '#10b981';
  const pct   = score * 100;
  const r = 42, circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-28 h-28 flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct / 100)}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="text-center">
          <div className="font-mono text-2xl font-bold" style={{ color }}>{pct.toFixed(0)}</div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">score</div>
        </div>
      </div>
      <div
        className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
        style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}
      >
        {decision}
      </div>
      {/* Pattern annotation */}
      {pattern && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold"
             style={{ background: 'rgba(244,63,94,0.08)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)' }}>
          <ShieldAlert size={12} />
          {pattern.replace(/_/g, ' ')} detected
        </div>
      )}
    </div>
  );
};

const SimulatorTab: React.FC<SimulatorTabProps> = ({ onInject, lastResult, lastDecision: _lastDecision, isConnected }) => {
  const [loading, setLoading] = useState<TxnType | null>(null);
  const [customVpa, setCustomVpa] = useState('');
  const [customPayee, setCustomPayee] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customRemark, setCustomRemark] = useState('');

  // Auto-demo state
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState(-1);
  const demoCancelRef = useRef(false);

  const handleInject = (type: TxnType) => {
    setLoading(type);
    setTimeout(() => {
      onInject(type);
      setLoading(null);
    }, isConnected ? 100 : 600);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('random');
    const custom = {
      vpa: customVpa || undefined,
      payee: customPayee || undefined,
      amount: customAmount || undefined,
      remark: customRemark || undefined,
    };
    setTimeout(() => {
      onInject('random', custom);
      setLoading(null);
    }, isConnected ? 100 : 600);
  };

  // ── Auto-demo runner ──
  const runDemo = useCallback(async () => {
    demoCancelRef.current = false;
    setDemoRunning(true);

    for (let i = 0; i < DEMO_SEQUENCE.length; i++) {
      if (demoCancelRef.current) break;
      setDemoStep(i);
      onInject(DEMO_SEQUENCE[i].type);
      await new Promise(r => setTimeout(r, 1500));
    }

    setDemoRunning(false);
    setDemoStep(-1);
  }, [onInject]);

  const stopDemo = () => {
    demoCancelRef.current = true;
    setDemoRunning(false);
    setDemoStep(-1);
  };

  return (
    <div className="space-y-5 fade-up">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3">
          <Panel>
            <PanelHeader
              icon={<Cpu size={18} className="text-cyan-400" />}
              iconBg="rgba(6,182,212,0.12)"
              title="Inject Test Transactions"
              badge={
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                    isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {isConnected ? 'Live ML Pipeline' : 'Local Mock Mode'}
                  </span>
                </div>
              }
            />
            <p className="text-[13px] text-slate-400 mb-5 leading-relaxed">
              {isConnected
                ? 'Transactions are scored by 5 real ML models via the ensemble pipeline.'
                : 'Simulate fraud patterns to validate the detection pipeline.'}
            </p>

            {/* ── Auto Demo Button ── */}
            <div className="mb-4">
              <button
                onClick={demoRunning ? stopDemo : runDemo}
                disabled={!!loading && !demoRunning}
                className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all duration-300 ${
                  demoRunning
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white shadow-lg shadow-cyan-500/20'
                } disabled:opacity-50`}
              >
                {demoRunning ? (
                  <>
                    <Square size={16} fill="currentColor" />
                    Stop Demo ({demoStep + 1}/{DEMO_SEQUENCE.length})
                  </>
                ) : (
                  <>
                    <Play size={16} fill="currentColor" />
                    Run Demo Sequence
                  </>
                )}
              </button>
              {demoRunning && demoStep >= 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                      style={{ width: `${((demoStep + 1) / DEMO_SEQUENCE.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {DEMO_SEQUENCE[demoStep]?.label}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SCENARIOS.map(s => (
                <button
                  key={s.type}
                  onClick={() => handleInject(s.type)}
                  disabled={!!loading || demoRunning}
                  className="group relative overflow-hidden p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]
                             text-left transition-all duration-200 hover:border-white/[0.14] hover:-translate-y-0.5
                             hover:shadow-lg disabled:opacity-60"
                >
                  <div className="relative z-10 flex items-center gap-3">
                    <span className="text-2xl">{loading === s.type ? <Loader2 size={24} className="animate-spin text-slate-400" /> : s.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-200">{s.label}</div>
                      <div className="text-[10px] text-slate-500">{s.risk} Risk</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="xl:col-span-2 flex flex-col gap-5">
          <Panel className="flex-1">
            <PanelHeader icon={<Send size={18} className="text-emerald-400" />} iconBg="rgba(16,185,129,0.12)" title="Last Decision" />
            {lastResult ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <ScoreRing score={lastResult.score} decision={lastResult.decision} pattern={lastResult.pattern} />
                <div className="w-full space-y-2 text-sm">
                  {[
                    { label: 'Payee',   value: lastResult.payee },
                    { label: 'Amount',  value: `₹${lastResult.amount.toLocaleString('en-IN')}` },
                    { label: 'Pattern', value: lastResult.pattern ?? 'None' },
                    { label: 'Latency', value: `${lastResult.latency}ms` },
                    { label: 'Tap Pressure', value: 'N/A' },
                    { label: 'PIN Latency', value: 'N/A' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-white/[0.04]">
                      <span className="text-[11px] text-slate-500">{row.label}</span>
                      <span className="text-[12px] text-slate-300 font-medium truncate max-w-[160px]">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                <div className="text-4xl mb-3 opacity-30 text-slate-400">
                  <Target size={48} />
                </div>
                <div className="text-sm text-slate-600 font-medium">No result yet</div>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader icon={<Edit3 size={18} className="text-violet-400" />} iconBg="rgba(139,92,246,0.12)" title="Custom Scorer" />
            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <input
                className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors placeholder:text-slate-600"
                value={customVpa}
                onChange={e => setCustomVpa(e.target.value)}
                placeholder="Sender VPA (e.g. user@okaxis)"
              />
              <input
                className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors placeholder:text-slate-600"
                value={customPayee}
                onChange={e => setCustomPayee(e.target.value)}
                placeholder="Payee VPA (e.g. merchant@paytm)"
              />
              <input
                className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors placeholder:text-slate-600"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder="Amount (₹)"
              />
              <input
                className="w-full px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors placeholder:text-slate-600"
                value={customRemark}
                onChange={e => setCustomRemark(e.target.value)}
                placeholder="Remark (e.g. refund processing fee)"
              />
              <button
                type="submit"
                disabled={!!loading || demoRunning}
                className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold uppercase tracking-widest transition-all duration-200 disabled:opacity-50"
              >
                {loading === 'random' ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Run Custom Analysis'}
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default SimulatorTab;
