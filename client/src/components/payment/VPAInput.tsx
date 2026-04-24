import { useState } from 'react';
import { motion } from 'framer-motion';
import { AtSign, ArrowRight, User } from 'lucide-react';

interface Props {
  onSubmit: (userVpa: string, payeeVpa: string) => void;
  initialUserVpa?: string;
  initialPayeeVpa?: string;
}

const RECENT_CONTACTS = [
  { name: 'Zomato', vpa: 'zomato@icici' },
  { name: 'Swiggy', vpa: 'swiggy@hdfcbank' },
  { name: 'Amazon', vpa: 'amazon@apl' },
  { name: 'PhonePe', vpa: 'merchant@ybl' },
  { name: 'Flipkart', vpa: 'flipkart@axisbank' },
  { name: 'Ola', vpa: 'ola@okaxis' },
];

function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(vpa);
}

export default function VPAInput({ onSubmit, initialUserVpa = '', initialPayeeVpa = '' }: Props) {
  const [userVpa, setUserVpa] = useState(initialUserVpa || 'user@okaxis');
  const [payeeVpa, setPayeeVpa] = useState(initialPayeeVpa);
  const [focused, setFocused] = useState(false);
  const isValid = isValidVpa(payeeVpa);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex flex-col items-center gap-8 w-full max-w-md mx-auto"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="font-display text-2xl font-semibold text-white">
          Send Money
        </h2>
        <p className="font-display text-sm text-white/40">
          Enter the recipient's UPI ID
        </p>
      </div>

      {/* Sender (small) */}
      <div className="w-full px-1">
        <label className="text-[10px] font-display text-white/30 uppercase tracking-widest mb-1 block">
          From
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-surface-raised border border-white/[0.07] px-4 py-2.5">
          <User size={14} className="text-white/30" />
          <input
            value={userVpa}
            onChange={(e) => setUserVpa(e.target.value)}
            className="flex-1 bg-transparent font-mono text-sm text-white/60 outline-none"
            placeholder="your@vpa"
          />
        </div>
      </div>

      {/* Payee VPA — big input */}
      <div className="w-full px-1">
        <label className="text-[10px] font-display text-white/30 uppercase tracking-widest mb-1 block">
          To
        </label>
        <div
          className={`
            flex items-center gap-2 rounded-2xl border px-5 py-4
            transition-all duration-200
            ${
              focused
                ? 'border-primary/50 bg-primary/[0.04] shadow-[0_0_30px_rgba(0,212,106,0.08)]'
                : 'border-white/[0.07] bg-surface-raised'
            }
          `}
        >
          <AtSign
            size={20}
            className={`transition-colors duration-200 ${
              focused ? 'text-primary' : 'text-white/30'
            }`}
          />
          <input
            autoFocus
            value={payeeVpa}
            onChange={(e) => setPayeeVpa(e.target.value.toLowerCase())}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="recipient@upi"
            className="flex-1 bg-transparent font-mono text-lg text-white outline-none placeholder:text-white/20"
          />
        </div>
        {payeeVpa.length > 0 && !isValid && (
          <p className="text-[11px] text-block/80 font-display mt-2 ml-1">
            Enter a valid UPI ID (e.g. name@bank)
          </p>
        )}
      </div>

      {/* Recent contacts */}
      <div className="w-full px-1">
        <p className="text-[10px] font-display text-white/30 uppercase tracking-widest mb-3">
          Quick Select
        </p>
        <div className="grid grid-cols-3 gap-2">
          {RECENT_CONTACTS.map((c) => (
            <button
              key={c.vpa}
              onClick={() => setPayeeVpa(c.vpa)}
              className={`
                flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center
                transition-all duration-150
                ${
                  payeeVpa === c.vpa
                    ? 'border-primary/40 bg-primary/[0.06]'
                    : 'border-white/[0.05] bg-surface hover:bg-surface-raised'
                }
              `}
            >
              <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs">
                {c.name[0]}
              </div>
              <span className="text-[11px] font-display text-white/60 truncate w-full">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Continue button */}
      <motion.button
        disabled={!isValid}
        onClick={() => onSubmit(userVpa, payeeVpa)}
        whileTap={{ scale: 0.97 }}
        className={`
          w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl
          font-display font-semibold text-sm transition-all duration-200
          ${
            isValid
              ? 'bg-primary text-bg hover:bg-primary-dim shadow-[0_4px_24px_rgba(0,212,106,0.25)]'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          }
        `}
      >
        Continue
        <ArrowRight size={16} />
      </motion.button>
    </motion.div>
  );
}
