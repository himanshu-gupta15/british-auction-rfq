import { formatDuration } from '../utils.js';

/** Live countdown to close (or to start, for upcoming auctions). */
export default function Countdown({ rfq, now }) {
  const start = new Date(rfq.bid_start_at).getTime();
  const close = new Date(rfq.current_bid_close_at).getTime();
  if (now < start) return <span className="muted">Starts in {formatDuration(start - now)}</span>;
  if (now >= close) return <span className="muted">Ended</span>;
  const left = close - now;
  const windowMs = rfq.trigger_window_minutes * 60000;
  return (
    <span className={left <= windowMs ? 'countdown hot' : 'countdown'} title={left <= windowMs ? 'Inside trigger window' : ''}>
      {formatDuration(left)} left
    </span>
  );
}
