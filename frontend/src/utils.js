import { useEffect, useRef, useState } from 'react';

export const money = (v) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const dateTimeSec = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }) : '—';

export const dateOnly = (v) =>
  v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

export const TRIGGER_LABELS = {
  BID_RECEIVED: 'Bid received in last X minutes',
  ANY_RANK_CHANGE: 'Any supplier rank change in last X minutes',
  L1_RANK_CHANGE: 'Lowest bidder (L1) change in last X minutes',
};

export const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  FORCE_CLOSED: 'Force Closed',
};

/** Format remaining ms as "1h 02m 05s". */
export function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  if (m) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

/** Ticks every second; returns a "now" corrected by the server clock offset. */
export function useServerNow(serverTime) {
  const offset = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (serverTime) offset.current = new Date(serverTime).getTime() - Date.now();
  }, [serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now + offset.current;
}

/** Calls `fn` immediately and every `ms` while the tab is visible. */
export function usePolling(fn, ms) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    saved.current();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') saved.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** datetime-local value (local time) -> ISO string */
export const localToIso = (v) => (v ? new Date(v).toISOString() : '');

/** Date -> value for <input type="datetime-local"> */
export function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Same rule as the backend, so the badge flips the moment the timer hits zero. */
export function liveStatus(rfq, now) {
  const start = new Date(rfq.bid_start_at).getTime();
  const close = new Date(rfq.current_bid_close_at).getTime();
  const forced = new Date(rfq.forced_bid_close_at).getTime();
  if (now < start) return 'UPCOMING';
  if (now < close) return 'ACTIVE';
  return close >= forced ? 'FORCE_CLOSED' : 'CLOSED';
}
