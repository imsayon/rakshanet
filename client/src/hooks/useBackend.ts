import { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkBackendConnectivity,
  scoreTransaction,
  fetchOverview,
  fetchRecent,
  type BackendDecision,
  type BackendOverview,
  type BackendRecentRow,
  type TransactionPayload,
} from '../api';
import { generateTxn, buildPayload, mapBackendDecision } from '../data';
import type { Transaction, TxnType } from '../types';

interface BackendState {
  /** Whether at least the decision engine is reachable */
  isConnected: boolean;
  /** Which individual services are up */
  services: { decisionEngine: boolean; dashboard: boolean; ingestion: boolean };
  /** Submit a transaction — uses backend if connected, else mock data */
  submitTransaction: (
    type: TxnType,
    thresholds: { friction: number; block: number },
    custom?: { vpa?: string; payee?: string; amount?: string; remark?: string },
  ) => Promise<{ txn: Transaction; backendDecision: BackendDecision | null }>;
  /** Latest backend overview stats (null if dashboard not reachable) */
  overview: BackendOverview | null;
  /** Backend recent decisions mapped to Transaction[] */
  recentTxns: Transaction[];
  /** Last raw backend decision (for detailed display) */
  lastBackendDecision: BackendDecision | null;
  /** Connection check is in progress */
  checking: boolean;
}

/**
 * Hook that manages backend connectivity and provides a unified
 * interface for submitting transactions (real or mock).
 */
export function useBackend(): BackendState {
  const [isConnected, setIsConnected] = useState(false);
  const [services, setServices] = useState({
    decisionEngine: false,
    dashboard: false,
    ingestion: false,
  });
  const [overview, setOverview] = useState<BackendOverview | null>(null);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [lastBackendDecision, setLastBackendDecision] = useState<BackendDecision | null>(null);
  const [checking, setChecking] = useState(true);
  const connectedRef = useRef(false);

  // ── Connectivity check on mount + periodic recheck ──
  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      try {
        const result = await checkBackendConnectivity();
        if (cancelled) return;
        setServices(result);
        const connected = result.decisionEngine;
        setIsConnected(connected);
        connectedRef.current = connected;
      } catch {
        if (!cancelled) {
          setIsConnected(false);
          connectedRef.current = false;
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    probe();
    const id = setInterval(probe, 15_000); // Re-check every 15s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Poll dashboard overview when connected ──
  useEffect(() => {
    if (!services.dashboard) { setOverview(null); return; }

    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchOverview(60);
        if (!cancelled) setOverview(data);
      } catch { /* non-fatal */ }
    };

    poll();
    const id = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [services.dashboard]);

  // ── Poll recent decisions when connected ──
  useEffect(() => {
    if (!services.dashboard) { setRecentTxns([]); return; }

    let cancelled = false;
    const poll = async () => {
      try {
        const rows: BackendRecentRow[] = await fetchRecent(30);
        if (cancelled) return;
        const mapped: Transaction[] = rows.map((row, _i) => ({
          id: row.txn_id,
          user: row.user_vpa || '',
          payee: row.payee_vpa || '',
          amount: row.amount || 0,
          score: row.score,
          decision: row.decision,
          pattern: row.pattern,
          remark: '',
          timestamp: new Date(row.timestamp),
          latency: row.latency_ms,
        }));
        setRecentTxns(mapped);
      } catch { /* non-fatal */ }
    };

    poll();
    const id = setInterval(poll, 8_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [services.dashboard]);

  // ── Submit transaction ──
  const submitTransaction = useCallback(async (
    type: TxnType,
    thresholds: { friction: number; block: number },
    custom?: { vpa?: string; payee?: string; amount?: string; remark?: string },
  ) => {
    // If backend is connected, send a real transaction
    if (connectedRef.current) {
      try {
        const payload: TransactionPayload = buildPayload(type, custom);
        const decision: BackendDecision = await scoreTransaction(payload);
        setLastBackendDecision(decision);

        const txn = mapBackendDecision(decision, payload);
        return { txn, backendDecision: decision };
      } catch (err) {
        console.warn('[useBackend] Backend call failed, falling back to mock:', err);
      }
    }

    // Fallback to mock data
    const txn = generateTxn(type, thresholds);
    return { txn, backendDecision: null };
  }, []);

  return {
    isConnected,
    services,
    submitTransaction,
    overview,
    recentTxns,
    lastBackendDecision,
    checking,
  };
}
