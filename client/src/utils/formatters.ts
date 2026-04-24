/** Format amount in Indian Rupee style: ₹1,23,456 */
export function formatAmount(value: number): string {
  const str = Math.abs(value).toFixed(2);
  const [intPart, decPart] = str.split('.');

  // Indian grouping: last 3 digits, then groups of 2
  let result = '';
  const len = intPart.length;
  if (len <= 3) {
    result = intPart;
  } else {
    result = intPart.slice(-3);
    let remaining = intPart.slice(0, -3);
    while (remaining.length > 2) {
      result = remaining.slice(-2) + ',' + result;
      remaining = remaining.slice(0, -2);
    }
    if (remaining.length > 0) {
      result = remaining + ',' + result;
    }
  }

  const sign = value < 0 ? '-' : '';
  return `${sign}₹${result}.${decPart}`;
}

/** Short amount without decimals: ₹250 */
export function formatAmountShort(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000)    return `₹${(value / 100_000).toFixed(1)}L`;
  if (value >= 1_000)      return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
}

/** Truncate a VPA for display: "verylongname@okaxis" → "verylong…@okaxis" */
export function formatVPA(vpa: string, maxLen = 18): string {
  if (vpa.length <= maxLen) return vpa;
  const parts = vpa.split('@');
  if (parts.length !== 2) return vpa.slice(0, maxLen) + '…';
  const [user, domain] = parts;
  const keep = maxLen - domain.length - 2; // 2 for @ and …
  if (keep < 3) return vpa.slice(0, maxLen) + '…';
  return `${user.slice(0, keep)}…@${domain}`;
}

/** Format latency: 45 → "45ms" */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format a score as percentage: 0.847 → "84.7%" */
export function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

/** Format an ISO timestamp to human-readable local time */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Full date + time */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Generate a unique transaction ID */
export function generateTxnId(): string {
  return `TXN${Date.now()}`;
}

/** Generate a random device-id for demo */
export function generateDeviceId(): string {
  return `DEV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
