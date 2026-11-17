import { useState } from 'react';
import { api } from '../api.js';
import { hhmm, inWindow, money } from '../utils.js';
import { AlertIcon, CheckIcon } from './Icons.jsx';

const empty = {
  supplier_name: '',
  carrier_name: '',
  freight_charges: '',
  origin_charges: '',
  destination_charges: '',
  transit_time_days: '',
  quote_validity_date: '',
};

/** Rank this total would get, compared with every *other* supplier's live bid. */
function rankHint(rfq, form, total) {
  if (!(total > 0)) return null;
  const me = form.supplier_name.trim().toLowerCase();
  const mine = rfq.rankings.find((r) => r.supplier_name.toLowerCase() === me);
  if (mine && total >= mine.total_amount) {
    return { cls: 'hint-bad', text: `Must be lower than your last bid (${money(mine.total_amount)})` };
  }
  const others = rfq.rankings.filter((r) => r !== mine);
  const rank = others.filter((r) => r.total_amount <= total).length + 1;
  if (rank === 1 && others.length) {
    return { cls: 'hint-good', text: `Would rank L1, ${money(others[0].total_amount - total)} below current lowest` };
  }
  if (rank === 1) return { cls: 'hint-good', text: 'Would rank L1 (first bid)' };
  return { cls: 'hint-neutral', text: `Would rank L${rank}` };
}

/** Quote submission. No auth in this demo, so suppliers type their company name. */
export default function BidForm({ rfq, now, onSubmitted }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const total = ['freight_charges', 'origin_charges', 'destination_charges'].reduce((s, k) => s + (Number(form[k]) || 0), 0);
  const hint = rankHint(rfq, form, total);

  const close = new Date(rfq.current_bid_close_at).getTime();
  const forced = new Date(rfq.forced_bid_close_at).getTime();
  const hot = inWindow(rfq, now) && close < forced;
  const extendTo = new Date(Math.min(forced, close + rfq.extension_minutes * 60000));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await api.submitBid(rfq.id, form);
      const ext = res.extension;
      setMessage({
        type: 'success',
        text: (
          <>Bid placed: <b>{money(res.bid.total_amount)}</b>, ranked <b>{res.bid.rank_label}</b>.
            {ext && <> Auction extended to <b className="mono">{hhmm(ext.new_close_at)}</b>: {ext.reason.toLowerCase()}{ext.capped ? ' (capped at forced close)' : ''}.</>}
          </>
        ),
      });
      // keep identity fields so the supplier can quickly revise their bid
      setForm((f) => ({ ...empty, supplier_name: f.supplier_name, carrier_name: f.carrier_name,
        transit_time_days: f.transit_time_days, quote_validity_date: f.quote_validity_date }));
      onSubmitted(res.rfq);
    } catch (err) {
      setErrors(err.details || {});
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const input = (name, label, props = {}) => (
    <label className="lbl">
      {label}
      <input className={`inp${props.type === 'number' && name !== 'transit_time_days' ? ' mono' : ''}${errors[name] ? ' err' : ''}`}
        value={form[name]} onChange={set(name)} {...props} />
      {errors[name] && <span className="err-msg">{errors[name]}</span>}
    </label>
  );

  return (
    <form className="card pad" onSubmit={submit} noValidate>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Submit a quote</h2>
          <p className="sub">You can only lower your own previous bid. Rank is decided by the lowest total.</p>
        </div>
        {hot && (
          <span className="chip-warn">
            {rfq.extension_trigger === 'BID_RECEIVED'
              ? `Submitting now extends close to ${hhmm(extendTo)}`
              : `Inside trigger window · may extend to ${hhmm(extendTo)}`}
          </span>
        )}
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} role="status">
          {message.type === 'success' ? <CheckIcon /> : <AlertIcon />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid g-220">
        {input('supplier_name', 'Supplier (your company)', { placeholder: 'e.g. Acme Freight' })}
        {input('carrier_name', 'Carrier', { placeholder: 'e.g. BlueDart' })}
      </div>
      <div className="grid g-160">
        {input('freight_charges', 'Freight charges (₹)', { type: 'number', min: 0, step: '0.01' })}
        {input('origin_charges', 'Origin charges (₹)', { type: 'number', min: 0, step: '0.01' })}
        {input('destination_charges', 'Destination charges (₹)', { type: 'number', min: 0, step: '0.01' })}
      </div>
      <div className="grid g-220">
        {input('transit_time_days', 'Transit time (days)', { type: 'number', min: 1, step: 1 })}
        {input('quote_validity_date', 'Quote valid until', { type: 'date' })}
      </div>

      <div className="submit-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Your total quote</span>
          <span className="total-big">{money(total)}</span>
          {hint && <span className={hint.cls}>{hint.text}</span>}
        </div>
        <button className="btn-primary lg" disabled={saving}>{saving ? 'Submitting…' : 'Submit bid'}</button>
      </div>
    </form>
  );
}
