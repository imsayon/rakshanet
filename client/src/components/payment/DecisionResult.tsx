import { motion } from 'framer-motion';
import { X, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import type { DecisionResponse } from '@/api';
import type { TransactionStatus } from '@/hooks/useTransaction';
import { MODEL_NAMES, PATTERN_MAP, REASONS_MAP } from '@/utils/constants';
import { useEffect, useRef, useCallback } from 'react';

interface Props {
  status: TransactionStatus;
  decision: DecisionResponse | null;
  txnId: string;
  error: string | null;
  onReset: () => void;
  onViewDetails?: () => void;
}

export default function DecisionResult({ status, decision, txnId, error, onReset, onViewDetails }: Props) {
  const onViewDetailsInternal = () => {
    if (onViewDetails) {
      onViewDetails();
    }
  };

  if (status === 'submitting' || status === 'polling') {
    return <ProcessingState decision={decision} />;
  }

  if (status === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-block/15 flex items-center justify-center">
          <X size={28} className="text-block" />
        </div>
        <p className="font-display text-white/60 text-sm">{error || 'Something went wrong'}</p>
        <button
          onClick={onReset}
          className="text-xs font-display text-primary hover:underline"
        >
          Try Again
        </button>
      </motion.div>
    );
  }

  if (status === 'done' && decision) {
    return (
      <ResultView
        decision={decision}
        txnId={txnId}
        onReset={onReset}
        onViewDetails={onViewDetailsInternal}
      />
    );
  }

  return null;
}

/* ── Processing State ── */
function ProcessingState(_props: { decision: DecisionResponse | null }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-6"
    >
      {/* Pulsing ring */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring-expand" />
        <div className="absolute inset-2 rounded-full bg-primary/15 animate-pulse-ring-expand" style={{ animationDelay: '0.5s' }} />
        <div className="absolute inset-4 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-primary" />
        </div>
      </div>

      <p className="font-display text-sm text-white/60">Analyzing transaction…</p>

      {/* Model scores appearing one by one */}
      <div className="w-full max-w-xs space-y-2">
        {Object.entries(MODEL_NAMES).map(([key, meta], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.3 }}
            className="flex items-center justify-between text-xs"
          >
            <span className="font-display text-white/40">
              {meta.icon} {meta.label}
            </span>
            <span className="font-mono text-white/30">scoring…</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/* ── Result View ── */
function ResultView({
  decision,
  txnId,
  onReset,
  onViewDetails,
}: {
  decision: DecisionResponse;
  txnId: string;
  onReset: () => void;
  onViewDetails: () => void;
}) {
  const d = decision.decision;

  if (d === 'ALLOW') return <AllowResult decision={decision} txnId={txnId} onReset={onReset} onViewDetails={onViewDetails} />;
  if (d === 'FRICTION') return <FrictionResult decision={decision} txnId={txnId} onReset={onReset} onViewDetails={onViewDetails} />;
  return <BlockResult decision={decision} txnId={txnId} onReset={onReset} onViewDetails={onViewDetails} />;
}

/* ── ALLOW ── */
function AllowResult({ decision, onReset, onViewDetails }: { decision: DecisionResponse; txnId: string; onReset: () => void; onViewDetails: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const spawnConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    const particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; rot: number; vr: number }[] = [];
    const colors = ['#00D46A', '#4AE8A0', '#F5A623', '#00A854', '#ffffff'];
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight / 2;

    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
      });
    }

    let frame = 0;
    const animate = () => {
      frame++;
      if (frame > 60) return;
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, 1 - frame / 60);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      requestAnimationFrame(animate);
    };
    animate();
  }, []);

  useEffect(() => {
    const t = setTimeout(spawnConfetti, 400);
    return () => clearTimeout(t);
  }, [spawnConfetti]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="relative flex flex-col items-center gap-4 text-center"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Green check */}
      <div className="w-20 h-20 rounded-full bg-allow/15 flex items-center justify-center glow-allow">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <path
            d="M8 18 L15 25 L28 11"
            stroke="#00D46A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-draw-check"
          />
        </svg>
      </div>

      <h3 className="font-display text-xl font-semibold text-white">
        Payment Successful
      </h3>
      <p className="font-mono text-xs text-white/30">
        Score: {decision.score.toFixed(3)}
      </p>
      <p className="font-mono text-xs text-white/20">
        {decision.latency_ms}ms
      </p>

      <div className="flex gap-3 mt-4">
        <button
          onClick={onViewDetails}
          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-surface-raised border border-white/[0.07]
                     text-xs font-display text-white/60 hover:text-white transition-colors"
        >
          <Eye size={14} /> View Details
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary/10
                     text-xs font-display text-primary hover:bg-primary/20 transition-colors"
        >
          New Payment <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── FRICTION ── */
function FrictionResult({ decision, onReset, onViewDetails }: { decision: DecisionResponse; txnId: string; onReset: () => void; onViewDetails: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="flex flex-col items-center gap-4 text-center"
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: 2, duration: 0.6 }}
        className="w-20 h-20 rounded-full bg-friction/15 flex items-center justify-center glow-friction"
      >
        <AlertTriangle size={32} className="text-friction" />
      </motion.div>

      <h3 className="font-display text-xl font-semibold text-white">
        Verification Required
      </h3>
      <p className="font-display text-sm text-white/40">
        This payment needs additional verification
      </p>
      <p className="font-mono text-xs text-white/30">
        Score: {decision.score.toFixed(3)} · {decision.latency_ms}ms
      </p>

      {/* Reasons */}
      {decision.reasons.length > 0 && (
        <div className="w-full max-w-xs space-y-1 mt-2">
          {decision.reasons.map((r, i) => (
            <motion.div
              key={r}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-xs font-display text-friction/80 text-left px-3 py-1.5 rounded-lg bg-friction/[0.06]"
            >
              {REASONS_MAP[r] || r}
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <button onClick={onViewDetails} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-surface-raised border border-white/[0.07] text-xs font-display text-white/60 hover:text-white transition-colors">
          <Eye size={14} /> Details
        </button>
        <button onClick={onReset} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-friction/10 text-xs font-display text-friction hover:bg-friction/20 transition-colors">
          New Payment <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}

/* ── BLOCK ── */
function BlockResult({ decision, onReset, onViewDetails }: { decision: DecisionResponse; txnId: string; onReset: () => void; onViewDetails: () => void }) {
  const pattern = decision.pattern ? PATTERN_MAP[decision.pattern] : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4 text-center"
    >
      <motion.div
        animate={{ x: [0, -8, 8, -4, 4, 0] }}
        transition={{ duration: 0.4 }}
        className="w-20 h-20 rounded-full bg-block/15 flex items-center justify-center glow-block"
      >
        <X size={32} className="text-block" />
      </motion.div>

      <h3 className="font-display text-xl font-semibold text-white">
        Payment Blocked
      </h3>

      {pattern && (
        <span
          className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold"
          style={{ backgroundColor: pattern.color + '20', color: pattern.color }}
        >
          {pattern.label}
        </span>
      )}

      <p className="font-display text-sm text-white/40 max-w-xs">
        {pattern?.description || 'This transaction was flagged to protect you'}
      </p>

      <p className="font-mono text-xs text-white/30">
        Score: {decision.score.toFixed(3)} · {decision.latency_ms}ms
      </p>

      {/* Reasons */}
      {decision.reasons.length > 0 && (
        <div className="w-full max-w-xs space-y-1 mt-2">
          {decision.reasons.map((r, i) => (
            <motion.div
              key={r}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="text-xs font-display text-block/80 text-left px-3 py-1.5 rounded-lg bg-block/[0.06]"
            >
              {REASONS_MAP[r] || r}
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <button onClick={onViewDetails} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-surface-raised border border-white/[0.07] text-xs font-display text-white/60 hover:text-white transition-colors">
          <Eye size={14} /> Details
        </button>
        <button onClick={onReset} className="flex items-center gap-1 px-4 py-2 rounded-xl bg-block/10 text-xs font-display text-block hover:bg-block/20 transition-colors">
          New Payment <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}
