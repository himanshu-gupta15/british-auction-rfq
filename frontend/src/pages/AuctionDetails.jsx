import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  TRIGGER_LABELS, dateOnly, dateTime, dateTimeSec, liveStatus, money, usePolling, useServerNow,
} from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Countdown from '../components/Countdown.jsx';
import BidForm from '../components/BidForm.jsx';

const EVENT_META = {
  RFQ_CREATED: { icon: '📄', label: 'RFQ created' },
  BID_SUBMITTED: { icon: '💰', label: 'Bid submitted' },
  TIME_EXTENDED: { icon: '⏱️', label: 'Time extended' },
};

export default function AuctionDetails() {
  const { id } = useParams();
  const [rfq, setRfq] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const now = useServerNow(rfq?.server_time);

  usePolling(async () => {
    try {
      setRfq(await api.getRfq(id));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, 3000);

  if (error && !rfq) return <div className="alert alert-error">{error} <Link to="/">Back to auctions</Link></div>;
  if (!rfq) return <p className="muted">Loading…</p>;

  const status = liveStatus(rfq, now);
  const extendedMin = Math.round(
    (new Date(rfq.current_bid_close_at) - new Date(rfq.original_bid_close_at)) / 60000
  );

  return (
    <section>
      <Link to="/" className="back">← All auctions</Link>
      <div className="page-head">
        <div>
          <h1>{rfq.name}</h1>
          <p className="muted">{rfq.reference_id} · Pickup {dateOnly(rfq.pickup_date)}</p>
        </div>
        <div className="head-right">
          <StatusBadge status={status} />
          <div className="big-countdown"><Countdown rfq={rfq} now={now} /></div>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats">
        <div className="stat"><span className="muted">Current lowest bid</span><b>{money(rfq.lowest_bid)}</b>
          {rfq.rankings[0] && <span className="small">L1: {rfq.rankings[0].supplier_name}</span>}</div>
        <div className="stat"><span className="muted">Bid start</span><b>{dateTime(rfq.bid_start_at)}</b></div>
        <div className="stat"><span className="muted">Current bid close</span><b>{dateTime(rfq.current_bid_close_at)}</b>
          <span className="small">{rfq.extension_count > 0
            ? `Originally ${dateTime(rfq.original_bid_close_at)} (+${extendedMin} min, ${rfq.extension_count}×)`
            : 'Not extended'}</span></div>
        <div className="stat"><span className="muted">Forced close</span><b>{dateTime(rfq.forced_bid_close_at)}</b>
          <span className="small">Hard stop</span></div>
      </div>

      <div className="layout">
        <div className="col-main">
          <div className="card">
            <div className="row-between">
              <h2>Supplier rankings</h2>
              <span className="muted small">Latest bid per supplier, sorted by total price</span>
            </div>
            {rfq.rankings.length === 0 ? <p className="muted">No bids yet.</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th><th>Supplier / Carrier</th>
                      <th className="num">Freight</th><th className="num">Origin</th><th className="num">Destination</th>
                      <th className="num">Total</th><th>Transit</th><th>Valid until</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.rankings.map((r) => (
                      <Fragment key={r.supplier_id}>
                        <tr className={r.rank === 1 ? 'l1' : ''}>
                          <td><span className={`rank rank-${Math.min(r.rank, 4)}`}>{r.rank_label}</span></td>
                          <td><div className="strong">{r.supplier_name}</div><div className="muted small">{r.carrier_name}</div></td>
                          <td className="num">{money(r.freight_charges)}</td>
                          <td className="num">{money(r.origin_charges)}</td>
                          <td className="num">{money(r.destination_charges)}</td>
                          <td className="num strong">{money(r.total_amount)}</td>
                          <td>{r.transit_time_days} d</td>
                          <td className="nowrap">{dateOnly(r.quote_validity_date)}</td>
                          <td>
                            <button className="link" onClick={() => setExpanded(expanded === r.supplier_id ? null : r.supplier_id)}>
                              {r.revisions} bid{r.revisions > 1 ? 's' : ''} {expanded === r.supplier_id ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>
                        {expanded === r.supplier_id && (
                          <tr className="sub">
                            <td colSpan={9}>
                              <b>Bid history: {r.supplier_name}</b>
                              <ul className="history">
                                {rfq.bids.filter((b) => b.supplier_id === r.supplier_id).map((b) => (
                                  <li key={b.id}>
                                    {dateTimeSec(b.created_at)}: <b>{money(b.total_amount)}</b>
                                    {' '}(freight {money(b.freight_charges)}, origin {money(b.origin_charges)},
                                    {' '}destination {money(b.destination_charges)}; {b.carrier_name}; {b.transit_time_days} d;
                                    {' '}valid until {dateOnly(b.quote_validity_date)})
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {status === 'ACTIVE' ? (
            <BidForm rfqId={rfq.id} onSubmitted={setRfq} />
          ) : (
            <div className="card closed-note">
              <h2>{status === 'UPCOMING' ? 'Bidding has not started' : 'Bidding closed'}</h2>
              <p className="muted">
                {status === 'UPCOMING'
                  ? `Quotes can be submitted from ${dateTime(rfq.bid_start_at)}.`
                  : status === 'FORCE_CLOSED'
                    ? 'This auction reached its forced close time. No more bids are accepted.'
                    : `This auction closed at ${dateTime(rfq.current_bid_close_at)}.`}
                {status !== 'UPCOMING' && rfq.rankings[0] && ` Winning quote (L1): ${rfq.rankings[0].supplier_name}, ${money(rfq.rankings[0].total_amount)}.`}
              </p>
            </div>
          )}
        </div>

        <aside className="col-side">
          <div className="card">
            <h2>Auction configuration</h2>
            <dl className="config">
              <dt>Trigger window (X)</dt><dd>{rfq.trigger_window_minutes} min</dd>
              <dt>Extension duration (Y)</dt><dd>{rfq.extension_minutes} min</dd>
              <dt>Extension trigger</dt><dd>{TRIGGER_LABELS[rfq.extension_trigger]}</dd>
              <dt>Extensions so far</dt><dd>{rfq.extension_count}</dd>
            </dl>
          </div>

          <div className="card">
            <h2>Activity log</h2>
            <ol className="timeline">
              {rfq.activity.map((a) => (
                <li key={a.id} className={`ev ev-${a.event_type.toLowerCase()}`}>
                  <div className="ev-head">
                    <span>{EVENT_META[a.event_type]?.icon} {EVENT_META[a.event_type]?.label || a.event_type}</span>
                    <time>{dateTimeSec(a.created_at)}</time>
                  </div>
                  <div className="ev-msg">{a.message}</div>
                  {a.event_type === 'TIME_EXTENDED' && (
                    <div className="ev-detail">
                      <div><b>Reason:</b> {a.metadata.reason}</div>
                      <div>{dateTime(a.metadata.previous_close_at)} → <b>{dateTime(a.metadata.new_close_at)}</b>
                        {a.metadata.capped_at_forced_close && <span className="badge badge-force_closed">capped</span>}</div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
