import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  TRIGGER, clock, dateOnly, feedTime, hhmm, hhmmss, inWindow, liveStatus, money, usePolling, useServerNow,
} from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';
import BidForm from '../components/BidForm.jsx';
import { FeedIcon } from '../components/Icons.jsx';

const MIN = 60000;
const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;
const longDate = (v) =>
  new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function ClockBox({ rfq, status, now }) {
  const start = new Date(rfq.bid_start_at).getTime();
  const close = new Date(rfq.current_bid_close_at).getTime();
  const forced = new Date(rfq.forced_bid_close_at).getTime();
  const X = rfq.trigger_window_minutes;
  const Y = rfq.extension_minutes;

  if (status === 'UPCOMING') {
    return (
      <div className="clock-box">
        <span className="clock-label">Opens in</span>
        <span role="timer" className="clock">{clock(start - now)}</span>
        <span className="clock-note">Bidding starts at {hhmm(start)}</span>
      </div>
    );
  }
  if (status !== 'ACTIVE') {
    return (
      <div className="clock-box ended">
        <span className="clock-label">{status === 'FORCE_CLOSED' ? 'Force closed at' : 'Closed at'}</span>
        <span className="clock">{hhmm(close)}</span>
        <span className="clock-note">{status === 'FORCE_CLOSED' ? 'Reached the hard stop. No more bids accepted.' : 'Bidding is over. No more bids accepted.'}</span>
      </div>
    );
  }
  const hot = inWindow(rfq, now);
  const atCap = close >= forced;
  const what = { BID_RECEIVED: 'a new bid', ANY_RANK_CHANGE: 'a rank change', L1_RANK_CHANGE: 'a new L1' }[rfq.extension_trigger];
  return (
    <div className={`clock-box${hot ? ' hot' : ''}`}>
      <span className="clock-label">Closes in</span>
      <span role="timer" aria-live="off" className="clock">{clock(close - now)}</span>
      <span className="clock-note">
        {atCap ? 'At the forced close: no more extensions possible'
          : hot ? `Inside trigger window: ${what} pushes close by ${Y} min`
            : `Trigger window opens at ${hhmm(close - X * MIN)}`}
      </span>
    </div>
  );
}

function WindowTimeline({ rfq, status, now }) {
  const start = new Date(rfq.bid_start_at).getTime();
  const orig = new Date(rfq.original_bid_close_at).getTime();
  const close = new Date(rfq.current_bid_close_at).getTime();
  const forced = new Date(rfq.forced_bid_close_at).getTime();
  const span = forced - start;
  const at = (t) => ((t - start) / span) * 100;
  const winStart = Math.max(start, close - rfq.trigger_window_minutes * MIN);
  const extEnd = Math.min(forced, close + rfq.extension_minutes * MIN);
  const extendedMin = Math.round((close - orig) / MIN);
  const headroom = Math.round((forced - close) / MIN);
  const showNow = now >= start && now <= forced;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tl-head">
        <h2 className="h2-sm">Auction window</h2>
        <span className="sub">
          {status === 'ACTIVE' || status === 'UPCOMING'
            ? headroom > 0 ? `${headroom} min of headroom left before the forced close` : 'No headroom left: close equals forced close'
            : `Ran ${Math.round((close - start) / MIN)} min${extendedMin ? `, including ${extendedMin} min of extensions` : ''}`}
        </span>
      </div>
      <div className="tl" aria-hidden="true">
        <div className="tl-track" />
        <div className="tl-elapsed" style={{ width: pct(at(Math.min(now, close))) }} />
        <div className="tl-window" style={{ left: pct(at(winStart)), width: `calc(${pct(at(close))} - ${pct(at(winStart))})` }} />
        {status === 'ACTIVE' && extEnd > close && (
          <div className="tl-ext" style={{ left: pct(at(close)), width: `calc(${pct(at(extEnd))} - ${pct(at(close))})` }} />
        )}
        {extendedMin > 0 && <div className="tl-orig" style={{ left: pct(at(orig)) }} />}
        <div className="tl-close" style={{ left: pct(at(close)) }} />
        <div className="tl-forced" />
        {showNow && <div className="tl-now" style={{ left: pct(at(now)) }} />}
        {showNow && <span className="tl-now-label" style={{ left: pct(at(now)) }}>NOW</span>}
      </div>
      <div className="tl-legend">
        <div><div className="muted">Bid start</div><div className="v">{hhmm(start)}</div></div>
        <div><div className="muted">Original close</div><div className={`v${extendedMin ? ' strike' : ''}`}>{hhmm(orig)}</div></div>
        <div>
          <div className="amber">Current close</div>
          <div className="v amber" style={{ fontWeight: 700 }}>
            {hhmm(close)}{extendedMin > 0 && <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12 }}> (+{extendedMin} min)</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="red">Forced close · hard stop</div>
          <div className="v red" style={{ fontWeight: 700 }}>{hhmm(forced)}</div>
        </div>
      </div>
    </div>
  );
}

function feedMessage(a) {
  const m = a.metadata || {};
  if (a.event_type === 'TIME_EXTENDED') return `${m.reason || a.message}.`;
  if (a.event_type === 'BID_SUBMITTED' && m.total_amount !== undefined) {
    return [m.carrier, money(m.total_amount), m.rank && `ranked ${m.rank}`].filter(Boolean).join(' · ');
  }
  return a.message;
}

function feedTitle(a) {
  if (a.event_type === 'BID_SUBMITTED') return a.metadata?.supplier ? `Bid · ${a.metadata.supplier}` : 'Bid submitted';
  if (a.event_type === 'TIME_EXTENDED') return 'Time extended';
  return 'RFQ created';
}

export default function AuctionDetails() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const now = useServerNow(rfq?.server_time);

  usePolling(async () => {
    try {
      setRfq(await api.getRfq(id));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, 3000);

  if (!rfq) {
    return (
      <main className="page">
        {error ? <div className="alert alert-error" role="alert">{error}. <Link to="/">Back to auctions</Link></div> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  const status = liveStatus(rfq, now);
  const trig = TRIGGER[rfq.extension_trigger];
  const close = new Date(rfq.current_bid_close_at).getTime();
  const forced = new Date(rfq.forced_bid_close_at).getTime();
  const capped = rfq.extension_count > 0 && close >= forced;
  const extendedMin = Math.round((close - new Date(rfq.original_bid_close_at).getTime()) / MIN);
  const firstBid = rfq.bids[rfq.bids.length - 1];
  const drop = firstBid && rfq.lowest_bid !== null ? (firstBid.total_amount - rfq.lowest_bid) / firstBid.total_amount : null;
  const l1 = rfq.rankings[0];

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Auctions</Link><span aria-hidden="true">/</span>
        <span className="cur ref">{rfq.reference_id}</span>
      </nav>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card hero">
        <div className="hero-top">
          <div className="hero-title">
            <div className="chips">
              <StatusBadge status={status} />
              {rfq.extension_count > 0 && (
                <span className="badge badge-info">Extended ×{rfq.extension_count}{capped ? ' · capped' : ''}</span>
              )}
            </div>
            <h1>{rfq.name}</h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
              <span className="ref">{rfq.reference_id}</span> · Pickup {longDate(rfq.pickup_date)} ·
              Trigger: {trig.key === 'L1_RANK_CHANGE' ? trig.short : trig.short.toLowerCase()} in last {rfq.trigger_window_minutes} min
            </p>
          </div>
          <ClockBox rfq={rfq} status={status} now={now} />
        </div>
        <WindowTimeline rfq={rfq} status={status} now={now} />
      </section>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Current lowest bid</div>
          <div className="kpi-value">{money(rfq.lowest_bid)}</div>
          <div className="kpi-foot" style={l1 ? { color: 'var(--green)', fontWeight: 500 } : undefined}>
            {l1 ? `L1 · ${l1.supplier_name}` : 'No bids yet'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Price drop since first bid</div>
          <div className="kpi-value">{drop === null ? '—' : drop > 0 ? `−${(drop * 100).toFixed(1)}%` : '0%'}</div>
          <div className="kpi-foot">{firstBid ? `${money(firstBid.total_amount)} → ${money(rfq.lowest_bid)}` : 'Waiting for the first bid'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bids received</div>
          <div className="kpi-value">{rfq.bids.length}</div>
          <div className="kpi-foot">from {rfq.rankings.length} supplier{rfq.rankings.length === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Extensions</div>
          <div className="kpi-value">{rfq.extension_count} <small>/ +{extendedMin} min</small></div>
          <div className="kpi-foot">{Math.max(0, Math.round((forced - close) / MIN))} min headroom to forced close</div>
        </div>
      </div>

      <div className="split">
        <div className="split-main">
          <section className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <div>
                <h2>Supplier rankings</h2>
                <p className="sub">Latest bid per supplier, lowest total first</p>
              </div>
            </div>
            {rfq.rankings.length === 0 ? (
              <div className="empty">No bids yet.</div>
            ) : (
              <div className="table-scroll">
                <table className="table ranks">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Supplier</th>
                      <th scope="col" className="r">Freight</th>
                      <th scope="col" className="r">Origin</th>
                      <th scope="col" className="r">Dest.</th>
                      <th scope="col" className="r">Total</th>
                      <th scope="col">Transit</th>
                      <th scope="col" className="r">History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.rankings.map((r) => {
                      const isOpen = open === r.supplier_id;
                      return (
                        <Fragment key={r.supplier_id}>
                          <tr className={r.rank === 1 ? 'l1' : ''}>
                            <td><span className={`rank-chip${r.rank === 1 ? ' l1' : ''}`}>{r.rank_label}</span></td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{r.supplier_name}</div>
                              <div className="cell-sub" style={{ marginTop: 2 }}>{r.carrier_name} · valid to {dateOnly(r.quote_validity_date)}</div>
                            </td>
                            <td className="num">{money(r.freight_charges)}</td>
                            <td className="num">{money(r.origin_charges)}</td>
                            <td className="num">{money(r.destination_charges)}</td>
                            <td className="num total">{money(r.total_amount)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>{r.transit_time_days} day{r.transit_time_days === 1 ? '' : 's'}</td>
                            <td className="r">
                              <button type="button" className="ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.supplier_id)}>
                                {r.revisions} bid{r.revisions === 1 ? '' : 's'} <span aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="history">
                              <td colSpan={8}>
                                <ol className="hist">
                                  {rfq.bids.filter((b) => b.supplier_id === r.supplier_id).map((b) => (
                                    <li key={b.id}>
                                      <span className="mono muted">{hhmmss(b.created_at)}</span>
                                      <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{money(b.total_amount)}</span>
                                      <span>
                                        Freight {money(b.freight_charges)} · origin {money(b.origin_charges)} · dest. {money(b.destination_charges)} ·{' '}
                                        {b.carrier_name} · {b.transit_time_days} d · valid to {dateOnly(b.quote_validity_date)}
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {status === 'ACTIVE' ? (
            <BidForm rfq={rfq} now={now} onSubmitted={setRfq} />
          ) : (
            <section className="card pad">
              <div>
                <h2>{status === 'UPCOMING' ? 'Bidding has not started' : 'Bidding closed'}</h2>
                <p className="sub" style={{ marginTop: 6, fontSize: 14 }}>
                  {status === 'UPCOMING'
                    ? `Quotes can be submitted from ${hhmm(rfq.bid_start_at)} on ${dateOnly(rfq.bid_start_at)}.`
                    : status === 'FORCE_CLOSED'
                      ? 'This auction reached its forced close time. No more bids are accepted.'
                      : `This auction closed at ${hhmm(close)}. No more bids are accepted.`}
                  {status !== 'UPCOMING' && l1 && <> Winning quote (L1): <b>{l1.supplier_name}</b>, <b className="mono">{money(l1.total_amount)}</b>.</>}
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="split-side">
          <section className="card pad-sm">
            <h2 className="h2-sm" style={{ marginBottom: 14 }}>Auction rules</h2>
            <dl className="dl">
              <dt>Trigger window (X)</dt><dd className="mono">{rfq.trigger_window_minutes} min</dd>
              <dt>Extension (Y)</dt><dd className="mono">+{rfq.extension_minutes} min</dd>
              <dt>Trigger</dt><dd>{trig.short}</dd>
              <dt>Forced close</dt><dd className="mono" style={{ color: 'var(--red)' }}>{hhmm(forced)}</dd>
            </dl>
            <p className="rule-note">
              If {trig.phrase} in the last {rfq.trigger_window_minutes} minutes, the close moves {rfq.extension_minutes} minutes later, never past {hhmm(forced)}.
            </p>
          </section>

          <section className="card pad-sm">
            <h2 className="h2-sm" style={{ marginBottom: 16 }}>Activity</h2>
            <ol className="feed">
              {rfq.activity.map((a) => (
                <li key={a.id}>
                  <div className="feed-rail">
                    <span className={`feed-dot ${a.event_type === 'TIME_EXTENDED' ? 'ext' : a.event_type === 'BID_SUBMITTED' ? 'bid' : 'doc'}`}>
                      <FeedIcon type={a.event_type} />
                    </span>
                    <span className="feed-line" />
                  </div>
                  <div className="feed-body">
                    <div className="feed-top">
                      <span className="feed-title">{feedTitle(a)}</span>
                      <time className="feed-time" dateTime={a.created_at}>{feedTime(a.created_at)}</time>
                    </div>
                    <div className="feed-msg">
                      {feedMessage(a)}
                    </div>
                    {a.event_type === 'TIME_EXTENDED' && a.metadata?.new_close_at && (
                      <div className="feed-ext">
                        <span className="mono">{hhmm(a.metadata.previous_close_at)}</span> → <b className="mono">{hhmm(a.metadata.new_close_at)}</b>
                        {a.metadata.capped_at_forced_close && <span style={{ fontWeight: 600 }}> · capped at forced close</span>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
