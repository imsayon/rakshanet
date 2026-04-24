import React from 'react';
import type { Transaction } from '../types';

const formatCurrency = (amt: number) =>
  '₹' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const scoreConfig = (score: number) => {
  if (score >= 0.7) return { bg: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: 'rgba(244,63,94,0.25)' };
  if (score >= 0.3) return { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' };
  return { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.25)' };
};

const decisionConfig = (d: string) => {
  if (d === 'BLOCK')   return { bg: 'rgba(244,63,94,0.1)',  color: '#f43f5e' };
  if (d === 'FRICTION') return { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' };
  return { bg: 'rgba(16,185,129,0.1)', color: '#10b981' };
};

interface TxnItemProps {
  txn: Transaction;
  compact?: boolean;
  animate?: boolean;
  onClick?: () => void;
}

const TxnItem: React.FC<TxnItemProps> = ({ txn, compact, animate, onClick }) => {
  const sc = scoreConfig(txn.score);
  const dc = decisionConfig(txn.decision);

  return (
    <div
      onClick={onClick}
      className={`grid items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.02]
                  hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-200 ${onClick ? 'cursor-pointer' : 'cursor-default'}
                  ${animate ? 'slide-in' : ''}`}
      style={{ gridTemplateColumns: compact ? 'auto 1fr auto auto' : 'auto 1fr auto auto' }}
    >
      {/* Score badge */}
      <div
        className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-mono text-xs font-bold border"
        style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
      >
        {(txn.score * 100).toFixed(0)}
      </div>

      {/* Details */}
      <div className="min-w-0">
        <div className="font-mono text-xs font-semibold text-slate-200 mb-0.5 truncate">{txn.id}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {txn.user} → {txn.payee}{txn.remark ? ` · ${txn.remark}` : ''}
        </div>
      </div>

      {/* Amount */}
      <div className="font-mono text-sm font-semibold text-slate-200 text-right shrink-0">
        {formatCurrency(txn.amount)}
      </div>

      {/* Decision */}
      <div
        className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0 text-center min-w-[60px]"
        style={{ background: dc.bg, color: dc.color }}
      >
        {txn.decision}
      </div>
    </div>
  );
};

export default TxnItem;
