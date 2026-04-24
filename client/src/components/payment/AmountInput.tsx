import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { IndianRupee, Send, MessageSquare } from 'lucide-react';

interface Props {
  payeeVpa: string;
  onSubmit: (amount: number, remarks: string) => void;
  onBack: () => void;
  initialAmount?: number;
  initialRemarks?: string;
}

const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function AmountInput({
  payeeVpa,
  onSubmit,
  onBack,
  initialAmount,
  initialRemarks = '',
}: Props) {
  const [amountStr, setAmountStr] = useState(initialAmount ? String(initialAmount) : '');
  const [remarks, setRemarks] = useState(initialRemarks);

  const amount = parseFloat(amountStr) || 0;
  const isValid = amount > 0 && amount <= 100_000;

  const handleKey = useCallback((key: string) => {
    setAmountStr((prev) => {
      if (key === '⌫') return prev.slice(0, -1);
      if (key === '.' && prev.includes('.')) return prev;
      if (key === '.' && prev === '') return '0.';
      // Max 2 decimal places
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx > 2 && key !== '⌫') return prev;
      // Max 6 digits before decimal
      if (dotIdx === -1 && prev.replace('.', '').length >= 6 && key !== '⌫') return prev;
      return prev + key;
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center gap-6 w-full max-w-md mx-auto"
    >
      {/* Back + Payee */}
      <button
        onClick={onBack}
        className="self-start text-xs font-display text-white/40 hover:text-white/60 transition-colors"
      >
        ← Back
      </button>

      <div className="text-center">
        <p className="text-xs font-display text-white/40 mb-1">Paying</p>
        <p className="font-mono text-sm text-primary">{payeeVpa}</p>
      </div>

      {/* Giant amount display */}
      <div className="flex items-baseline gap-1 py-4">
        <IndianRupee size={28} className="text-white/40" />
        <span className="font-mono text-5xl font-bold text-white tabular-nums min-w-[60px] text-center">
          {amountStr || '0'}
        </span>
      </div>

      {/* Remarks */}
      <div className="w-full px-4">
        <div className="flex items-center gap-2 rounded-xl bg-surface-raised border border-white/[0.07] px-4 py-3">
          <MessageSquare size={14} className="text-white/30" />
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 bg-transparent font-display text-sm text-white outline-none placeholder:text-white/20"
          />
        </div>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
        {NUMPAD.map((key) => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            className="
              h-14 rounded-xl font-mono text-lg text-white/80
              bg-surface-raised border border-white/[0.05]
              hover:bg-white/[0.08] active:scale-95
              transition-all duration-100
            "
          >
            {key}
          </button>
        ))}
      </div>

      {/* Pay button */}
      <motion.button
        disabled={!isValid}
        onClick={() => onSubmit(amount, remarks)}
        whileTap={{ scale: 0.97 }}
        className={`
          w-full max-w-[280px] flex items-center justify-center gap-2 py-4 rounded-2xl
          font-display font-semibold text-sm transition-all duration-200
          ${
            isValid
              ? 'bg-primary text-bg hover:bg-primary-dim shadow-[0_4px_24px_rgba(0,212,106,0.25)]'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          }
        `}
      >
        <Send size={16} />
        Pay ₹{amountStr || '0'}
      </motion.button>
    </motion.div>
  );
}
