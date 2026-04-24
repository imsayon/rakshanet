import { useCallback, useState } from 'react';
import { api, type DecisionResponse, type TransactionPayload } from '@/api';
import { useDecisionPoll } from './useDecisionPoll';
import { generateDeviceId, generateTxnId } from '@/utils/formatters';

export type TransactionStatus = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

export function useTransaction() {
  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [txnId, setTxnId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const poll = useDecisionPoll();

  const submit = useCallback(
    async (
      payload: Omit<TransactionPayload, 'txn_id' | 'timestamp' | 'device_id'>,
    ) => {
      const id = generateTxnId();
      setTxnId(id);
      setStatus('submitting');
      setDecision(null);
      setError(null);

      try {
        await api.submitTransaction({
          ...payload,
          txn_id: id,
          timestamp: new Date().toISOString(),
          device_id: generateDeviceId(),
        });

        setStatus('polling');
        poll.startPolling(id);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Submission failed');
      }
    },
    [poll],
  );

  // Sync poll state back
  if (poll.status === 'done' && poll.decision && status === 'polling') {
    setDecision(poll.decision);
    setStatus('done');
  }
  if (poll.status === 'timeout' && status === 'polling') {
    setStatus('error');
    setError('Decision engine did not respond');
  }

  const reset = useCallback(() => {
    setStatus('idle');
    setDecision(null);
    setTxnId('');
    setError(null);
    poll.reset();
  }, [poll]);

  return { status, decision, txnId, error, submit, reset };
}
