import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { clock, formatDuration, inWindow, liveStatus, money, shortDT, usePolling, useServerNow } from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { PlusIcon, SearchIcon, TimerIcon } from '../components/Icons.jsx';

const TABS = [
  ['ALL', 'All'], ['ACTIVE', 'Active'], ['UPCOMING', 'Upcoming'], ['CLOSED', 'Closed'], ['FORCE_CLOSED', 'Force closed'],
];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function timeCell(r, now) {
  const start = new Date(r.bid_start_at).getTime();
  const close = new Date(r.current_bid_close_at).getTime();
  if (r.status === 'UPCOMING') return <span className="time dim">Starts in {formatDuration(start - now)}</span>;
  if (r.status !== 'ACTIVE') return <span className="time dim">Ended</span>;
  if (inWindow(r, now)) return <span className="time hot" title="Inside the trigger window">{clock(close - now)} left</span>;
  return <span className="time calm">{formatDuration(close - now)} left</span>;
}

function l1Line(r) {
  if (r.status === 'UPCOMING') return `Opens ${shortDT(r.bid_start_at)}`;
  if (!r.l1_supplier) return 'No bids yet';
  return r.status === 'ACTIVE' ? r.l1_supplier : `Won by ${r.l1_supplier}`;
}

export default function AuctionList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const now = useServerNow(data?.server_time);

  usePolling(async () => {
    try {
      setData(await api.listRfqs());
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, 5000);

  const all = (data?.items || []).map((r) => ({
    ...r,
    status: liveStatus(r, now),
    capped: r.extension_count > 0 && new Date(r.current_bid_close_at).getTime() >= new Date(r.forced_bid_close_at).getTime(),
  }));
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((r) => filter === 'ALL' || r.status === filter)
    .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.reference_id.toLowerCase().includes(needle));

  const live = all.filter((r) => r.status === 'ACTIVE');
  const hot = live.filter((r) => inWindow(r, now));
  const upcoming = all.filter((r) => r.status === 'UPCOMING')
    .sort((a, b) => new Date(a.bid_start_at) - new Date(b.bid_start_at));
  const extTotal = all.reduce((s, r) => s + r.extension_count, 0);
  const cappedCount = all.filter((r) => r.capped).length;

  return (
    <main className="page list">
      <div className="page-head">
        <div>
          <p className="eyebrow">Buyer workspace</p>
          <h1>British Auctions</h1>
          <p className="lead">Every RFQ with reverse bidding, ranked live. Close times extend automatically and never pass the forced close.</p>
        </div>
        <Link to="/rfqs/new" className="btn-primary"><PlusIcon />Create RFQ</Link>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-label">Live auctions</div>
          <div className="kpi-value">{live.length}</div>
          <div className="kpi-foot">{plural(live.reduce((s, r) => s + (r.bids_last_hour || 0), 0), 'bid')} in the last hour</div>
        </div>
        <div className={`kpi${hot.length ? ' warn' : ''}`}>
          <div className="kpi-label"><TimerIcon />In trigger window</div>
          <div className="kpi-value">{hot.length}</div>
          <div className="kpi-foot">{hot.length ? 'A qualifying bid extends the close' : 'No auction is near its close'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Starting soon</div>
          <div className="kpi-value">{upcoming.length}</div>
          <div className="kpi-foot">
            {upcoming[0] ? `${upcoming[0].name} in ${formatDuration(new Date(upcoming[0].bid_start_at) - now)}` : 'Nothing scheduled'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Extensions</div>
          <div className="kpi-value">{extTotal}</div>
          <div className="kpi-foot">{cappedCount} capped at forced close</div>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="card" aria-label="Auction list" style={{ overflow: 'hidden' }}>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Filter by status">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className="tab" onClick={() => setFilter(k)}>
                {label}
                <span className="tab-count">{k === 'ALL' ? all.length : all.filter((r) => r.status === k).length}</span>
              </button>
            ))}
          </div>
          <label className="search">
            <SearchIcon />
            <span className="sr-only">Search RFQs</span>
            <input type="search" placeholder="Search lane or reference" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        <div className="table-scroll">
          <table className="table list">
            <thead>
              <tr>
                <th scope="col">RFQ / lane</th>
                <th scope="col" className="r">Lowest bid (L1)</th>
                <th scope="col">Bid close</th>
                <th scope="col">Forced close</th>
                <th scope="col">Status</th>
                <th scope="col" className="r">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/rfqs/${r.id}`)}>
                  <td>
                    <Link to={`/rfqs/${r.id}`} className="row-link" onClick={(e) => e.stopPropagation()}>{r.name}</Link>
                    <div className="cell-sub">
                      <span className="ref">{r.reference_id}</span> ·{' '}
                      {r.bid_count ? `${plural(r.bid_count, 'bid')} · ${plural(r.supplier_count, 'supplier')}` : 'No bids yet'}
                    </div>
                  </td>
                  <td className="r">
                    <div className="mono" style={{ fontWeight: 600, fontSize: 15 }}>{money(r.lowest_bid)}</div>
                    <div className="cell-sub">{l1Line(r)}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{shortDT(r.current_bid_close_at)}</div>
                    {r.extension_count > 0 && (
                      <span className="chip-ext">Extended ×{r.extension_count}{r.capped ? ' · capped' : ''}</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{shortDT(r.forced_bid_close_at)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="r">{timeCell(r, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && rows.length === 0 && (
          <div className="empty">
            {all.length === 0 ? <>No auctions yet. <Link to="/rfqs/new">Create your first RFQ</Link></> : 'No auctions in this view.'}
          </div>
        )}
        {!data && !error && <div className="empty">Loading…</div>}
      </section>

      <p className="note">Times shown in your local time zone. Amber countdowns are inside the auction's trigger window (last X minutes before close).</p>
    </main>
  );
}
