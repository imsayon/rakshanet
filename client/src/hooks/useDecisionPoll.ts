import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DecisionResponse } from '@/api';

interface Options {
  /** Polling interval in ms (default 500) */
  interval?: number;
  /** Max polling duration in ms (default 10_000) */
  timeout?: number;
}

type PollStatus = 'idle' | 'polling' | 'done' | 'timeout' | 'error';

export function useDecisionPoll(options: Options = {}) {
  const { interval = 500, timeout = 10_000 } = options;

  const [status, setStatus] = useState<PollStatus>('idle');
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
  }, []);

  const startPolling = useCallback(
    (txnId: string) => {
      cleanup();
      setStatus('polling');
      setDecision(null);
      setError(null);

      // Timeout failsafe
      deadlineRef.current = setTimeout(() => {
        cleanup();
        setStatus('timeout');
        setError('Decision engine did not respond within timeout');
      }, timeout);

      timerRef.current = setInterval(async () => {
        try {
          const result = await api.getDecision(txnId);
          if (result && result.decision) {
            cleanup();
            setDecision(result);
            setStatus('done');
          }
        } catch {
          // Decision not ready yet — keep polling
        }
      }, interval);
    },
    [interval, timeout, cleanup],
  );

  const reset = useCallback(() => {
    cleanup();
    setStatus('idle');
    setDecision(null);
    setError(null);
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return { status, decision, error, startPolling, reset };
}
