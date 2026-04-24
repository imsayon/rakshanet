import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Fingerprint } from 'lucide-react';
import { useState } from 'react';

interface BiometricData {
  pin_entry_duration_ms: number;
  tap_pressure_avg: number;
  copy_paste_amount: boolean;
}

interface Props {
  value: BiometricData;
  onChange: (v: BiometricData) => void;
}

export default function BiometricsPanel({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full rounded-xl border border-white/[0.07] bg-surface overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-display text-white/50 hover:text-white/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Fingerprint size={14} className="text-primary/60" />
          <span>Demo Biometrics</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-5">
              {/* PIN Entry Duration */}
              <div>
                <div className="flex justify-between text-xs font-display mb-2">
                  <span className="text-white/40">PIN Entry Duration</span>
                  <span className="font-mono text-white/60">
                    {value.pin_entry_duration_ms}ms
                  </span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={5000}
                  step={50}
                  value={value.pin_entry_duration_ms}
                  onChange={(e) =>
                    onChange({ ...value, pin_entry_duration_ms: Number(e.target.value) })
                  }
                  className="w-full h-1 rounded-full appearance-none bg-white/10
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,212,106,0.4)]"
                />
                <div className="flex justify-between text-[10px] text-white/20 mt-1">
                  <span>200ms (fast — suspicious)</span>
                  <span>5000ms (slow)</span>
                </div>
              </div>

              {/* Tap Pressure */}
              <div>
                <div className="flex justify-between text-xs font-display mb-2">
                  <span className="text-white/40">Tap Pressure</span>
                  <span className="font-mono text-white/60">
                    {value.tap_pressure_avg.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={value.tap_pressure_avg}
                  onChange={(e) =>
                    onChange({ ...value, tap_pressure_avg: Number(e.target.value) })
                  }
                  className="w-full h-1 rounded-full appearance-none bg-white/10
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,212,106,0.4)]"
                />
              </div>

              {/* Copy-Paste Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-display text-white/40">
                  Copy-Paste Amount
                </span>
                <button
                  onClick={() =>
                    onChange({ ...value, copy_paste_amount: !value.copy_paste_amount })
                  }
                  className={`
                    relative w-10 h-5 rounded-full transition-colors duration-200
                    ${value.copy_paste_amount ? 'bg-primary' : 'bg-white/10'}
                  `}
                >
                  <span
                    className={`
                      absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm
                      transition-transform duration-200
                      ${value.copy_paste_amount ? 'translate-x-5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
