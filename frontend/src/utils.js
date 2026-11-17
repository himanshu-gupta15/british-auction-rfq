import { useEffect, useRef, useState } from 'react';

/** ₹44,300 (paise shown only when present) */
export const money = (v) =>
  v === null || v === undefined || v === ''
    ? '—'
    : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const pad2 = (n) => String(n).padStart(2, '0');
/** 14:08 */
export const hhmm = (v) => { const d = new Date(v); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/** 14:08:31 */
export const hhmmss = (v) => { const d = new Date(v); return `${hhmm(d)}:${pad2(d.getSeconds())}`; };
/** 17 Nov, 14:08 */
export const shortDT = (v) =>
  v ? `${new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${hhmm(v)}` : '—';
/** 17 Nov 14:08:31 (or just time if today) */
export const feedTime = (v) => {
  const d = new Date(v);
  return d.toDateString() === new Date().toDateString() ? hhmmss(d) : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ${hhmm(d)}`;
};
/** Big countdown: 07:52 or 1:59:07 */
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const dateTimeSec = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }) : '—';

export const dateOnly = (v) =>
  v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

export const TRIGGERS = [
  { key: 'BID_RECEIVED', title: 'Any bid received', short: 'Bid received', desc: 'Every quote in the last X minutes extends the auction.', phrase: 'any bid arrives' },
  { key: 'ANY_RANK_CHANGE', title: 'Any supplier rank changes', short: 'Any rank change', desc: 'Extends when a bid reorders the ranking (L1, L2, L3…).', phrase: 'any rank changes' },
  { key: 'L1_RANK_CHANGE', title: 'Lowest bidder (L1) changes', short: 'L1 change', desc: 'Extends only when a new supplier takes the lowest price.', phrase: 'a new supplier takes L1' },
];
export const TRIGGER = Object.fromEntries(TRIGGERS.map((t) => [t.key, t]));

export const STATUS_LABELS = {
  UPCOMING: 'Upcoming',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  FORCE_CLOSED: 'Force closed',
};

/** Remaining time for tables: "07:52 left" style handled by callers; this gives 1h 59m / 29m / 45s */
export function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** Is `now` inside the trigger window [close - X, close)? */
export function inWindow(rfq, now) {
  const close = new Date(rfq.current_bid_close_at).getTime();
  return now < close && now >= close - rfq.trigger_window_minutes * 60000 && now >= new Date(rfq.bid_start_at).getTime();
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
