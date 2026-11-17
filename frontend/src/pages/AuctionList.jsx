import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { dateTime, money, liveStatus, usePolling, useServerNow } from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Countdown from '../components/Countdown.jsx';

const FILTERS = ['ALL', 'ACTIVE', 'UPCOMING', 'CLOSED', 'FORCE_CLOSED'];

export default function AuctionList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
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

  const items = (data?.items || []).map((r) => ({ ...r, status: liveStatus(r, now) }));
  const shown = filter === 'ALL' ? items : items.filter((r) => r.status === filter);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>British Auctions</h1>
          <p className="muted">All RFQs with British-auction bidding. Updates automatically.</p>
        </div>
        <Link to="/rfqs/new" className="btn btn-primary">+ Create RFQ</Link>
      </div>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'All' : f === 'FORCE_CLOSED' ? 'Force Closed' : f[0] + f.slice(1).toLowerCase()}
            <span className="tab-count">{f === 'ALL' ? items.length : items.filter((r) => r.status === f).length}</span>
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && shown.length === 0 && (
        <div className="empty card">
          <p>No auctions here yet.</p>
          <Link to="/rfqs/new" className="btn btn-primary">Create your first RFQ</Link>
        </div>
      )}

      {shown.length > 0 && (
        <div className="card table-wrap">
          <table className="table clickable">
            <thead>
              <tr>
                <th>RFQ</th>
                <th className="num">Current lowest bid</th>
                <th>Current bid close</th>
                <th>Forced close</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/rfqs/${r.id}`)}>
                  <td>
                    <div className="strong">{r.name}</div>
                    <div className="muted small">{r.reference_id} · {r.bid_count} bids · {r.supplier_count} suppliers</div>
                  </td>
                  <td className="num">
                    <div className="strong">{money(r.lowest_bid)}</div>
                    {r.l1_supplier && <div className="muted small">L1: {r.l1_supplier}</div>}
                  </td>
                  <td>
                    {dateTime(r.current_bid_close_at)}
                    {r.extension_count > 0 && <div className="small accent">Extended ×{r.extension_count}</div>}
                  </td>
                  <td>{dateTime(r.forced_bid_close_at)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><Countdown rfq={r} now={now} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
