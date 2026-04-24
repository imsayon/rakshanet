import React, { useState } from 'react';
import { Panel, PanelHeader, LiveBadge } from '../components/Panel';
import TxnItem from '../components/TxnItem';
import { ClipboardList, X } from 'lucide-react';
import type { Transaction, Decision } from '../types';

const formatCurrency = (amt: number) =>
  '₹' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface TransactionsTabProps {
  transactions: Transaction[];
}

type Filter = 'ALL' | Decision;

const FILTERS: { label: string; value: Filter; color: string }[] = [
  { label: 'All',      value: 'ALL',      color: '#94a3b8' },
  { label: 'Blocked',  value: 'BLOCK',    color: '#f43f5e' },
  { label: 'Friction', value: 'FRICTION', color: '#f59e0b' },
  { label: 'Allowed',  value: 'ALLOW',    color: '#10b981' },
];

const TransactionsTab: React.FC<TransactionsTabProps> = ({ transactions }) => {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const filtered = filter === 'ALL' ? transactions : transactions.filter(t => t.decision === filter);

  return (
    <div className="space-y-4 fade-up">
      <Panel>
        <PanelHeader
          icon={<ClipboardList size={18} className="text-cyan-400" />}
          iconBg="rgba(6,182,212,0.12)"
          title="Transaction History"
          badge={<LiveBadge />}
        />

        {/* Filter pills */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200
                          ${filter === f.value
                            ? 'border-white/20 bg-white/10'
                            : 'border-white/[0.06] bg-transparent text-slate-400 hover:text-slate-200 hover:border-white/10'
                          }`}
              style={filter === f.value ? { color: f.color, boxShadow: `0 0 12px ${f.color}30` } : {}}
            >
              {f.label}
              <span className="ml-1.5 font-mono text-[10px] opacity-70">
                {f.value === 'ALL' ? transactions.length : transactions.filter(t => t.decision === f.value).length}
              </span>
            </button>
          ))}
        </div>

        {/* Transaction list */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[600px] pr-0.5">
          {filtered.length === 0 ? (
            <div className="text-center text-slate-600 py-12 text-sm">No transactions match filter</div>
          ) : (
            filtered.map(t => <TxnItem key={t.id} txn={t} onClick={() => setSelectedTxn(t)} />)
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-slate-600">
          <span>Showing {filtered.length} of {transactions.length} transactions</span>
          <span className="font-mono">Last 100 stored in memory</span>
        </div>
      </Panel>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTxn(null)}>
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                Transaction Details
              </h3>
              <button onClick={() => setSelectedTxn(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Transaction ID</span>
                <span className="text-sm font-mono text-slate-200">{selectedTxn.id}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Amount</span>
                <span className="text-sm font-mono text-slate-200">{formatCurrency(selectedTxn.amount)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Sender</span>
                <span className="text-sm text-slate-200">{selectedTxn.user}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Receiver</span>
                <span className="text-sm text-slate-200">{selectedTxn.payee}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Risk Score</span>
                <span className={`text-sm font-bold ${selectedTxn.decision === 'BLOCK' ? 'text-rose-400' : selectedTxn.decision === 'FRICTION' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {(selectedTxn.score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Decision</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${selectedTxn.decision === 'BLOCK' ? 'bg-rose-500/20 text-rose-400' : selectedTxn.decision === 'FRICTION' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {selectedTxn.decision}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Detected Pattern</span>
                <span className="text-sm text-slate-200">{selectedTxn.pattern ? selectedTxn.pattern.replace(/_/g, ' ') : 'None'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.04]">
                <span className="text-sm text-slate-400">Remarks</span>
                <span className="text-sm text-slate-200">{selectedTxn.remark || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-slate-400">Time</span>
                <span className="text-sm text-slate-200">{new Date(selectedTxn.timestamp).toLocaleString()}</span>
              </div>
            </div>
            
            {selectedTxn.reasons && selectedTxn.reasons.length > 0 && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Triggered Rules & Factors</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedTxn.reasons.map((reason, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-white/[0.04] border border-white/[0.08] rounded-md text-[11px] text-slate-300">
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsTab;
