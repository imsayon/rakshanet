import React from 'react';
import { Panel, PanelHeader } from '../components/Panel';
import type { FraudPattern } from '../types';
import { 
  ShieldAlert, 
  QrCode, 
  Smartphone, 
  Network, 
  ArrowDownCircle, 
  UserX,
  AlertTriangle,
  MapPin,
  Zap
} from 'lucide-react';

interface PatternsTabProps {
  patterns: FraudPattern[];
  transactions: { pattern: string | null; decision: string }[];
}

const IconResolver: React.FC<{ name: string; color: string; size?: number }> = ({ name, color, size = 24 }) => {
  const props = { size, style: { color } };
  switch (name) {
    case 'ShieldAlert':      return <ShieldAlert {...props} />;
    case 'QrCode':           return <QrCode {...props} />;
    case 'Smartphone':       return <Smartphone {...props} />;
    case 'Network':          return <Network {...props} />;
    case 'ArrowDownCircle':  return <ArrowDownCircle {...props} />;
    case 'UserX':            return <UserX {...props} />;
    default:                 return <AlertTriangle {...props} />;
  }
};

const PatternsTab: React.FC<PatternsTabProps> = ({ patterns, transactions }) => {
  const total = patterns.reduce((s, p) => s + p.count, 0);

  return (
    <div className="space-y-5 fade-up">
      <Panel>
        <PanelHeader
          icon={<Zap size={18} className="text-amber-400" />}
          iconBg="rgba(245,158,11,0.12)"
          title="Fraud Pattern Detection"
          badge={
            <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">{total} incidents today</span>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {patterns.map(p => {
            const pct = total === 0 ? 0 : (p.count / total) * 100;
            return (
              <div
                key={p.name}
                className="relative overflow-hidden p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]
                           hover:border-white/[0.14] hover:-translate-y-1 transition-all duration-300 cursor-default group"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `radial-gradient(circle at 50% 50%, ${p.color}18 0%, transparent 70%)` }}
                />
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${p.color}80, transparent)`, opacity: 0.6 }}
                />

                <div className="relative z-10">
                  <div className="mb-4">
                    <IconResolver name={p.icon} color={p.color} size={28} />
                  </div>
                  <div className="text-xs font-bold text-slate-300 mb-1 tracking-wide">{p.name}</div>
                  <div className="text-[11px] text-slate-500 mb-4 leading-relaxed">{p.desc}</div>

                  <div className="flex items-end justify-between">
                    <div className="font-mono text-3xl font-bold" style={{ color: p.color }}>
                      {p.count}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 uppercase tracking-tighter">of total</div>
                      <div className="text-xs font-mono font-bold" style={{ color: p.color }}>{pct.toFixed(0)}%</div>
                    </div>
                  </div>

                  <div className="mt-3 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: p.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<MapPin size={18} className="text-rose-400" />}
          iconBg="rgba(244,63,94,0.12)"
          title="Recent Pattern Hits"
        />
        <div className="divide-y divide-white/[0.04]">
          {transactions.filter(t => t.pattern).slice(0, 8).map((t, idx) => {
            const matched = patterns.find(p => p.name.replace(/ /g, '_') === t.pattern) || patterns[0];
            return (
              <div key={idx} className="flex items-center justify-between py-3 px-2 hover:bg-white/[0.01] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center">
                    <IconResolver name={matched?.icon || ''} color={matched?.color || '#94a3b8'} size={14} />
                  </div>
                  <span className="text-xs font-medium text-slate-300">{t.pattern?.replace(/_/g, ' ')}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  t.decision === 'BLOCK' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  t.decision === 'FRICTION' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {t.decision}
                </span>
              </div>
            );
          })}
          {transactions.filter(t => t.pattern).length === 0 && (
            <div className="text-center text-slate-600 py-8 text-sm">No pattern detections yet</div>
          )}
        </div>
      </Panel>
    </div>
  );
};

export default PatternsTab;
