import { useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';

const empty = {
  supplier_name: '',
  carrier_name: '',
  freight_charges: '',
  origin_charges: '',
  destination_charges: '',
  transit_time_days: '',
  quote_validity_date: '',
};

/** Quote submission form. No auth in this demo, so the supplier types their company name. */
export default function BidForm({ rfqId, disabled = false, onSubmitted }) {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const total = ['freight_charges', 'origin_charges', 'destination_charges']
    .reduce((s, k) => s + (Number(form[k]) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      const res = await api.submitBid(rfqId, form);
      const ext = res.extension;
      setMessage({
        type: 'success',
        text: `Bid placed: ${money(res.bid.total_amount)}, ranked ${res.bid.rank_label}.` +
          (ext ? ` Auction extended: ${ext.reason}.` : ''),
      });
      // Keep the supplier & carrier filled in so they can quickly revise their bid
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
    <label className={`field ${errors[name] ? 'has-error' : ''}`}>
      <span className="label">{label}</span>
      <input value={form[name]} onChange={set(name)} disabled={disabled} {...props} />
      {errors[name] && <span className="error">{errors[name]}</span>}
    </label>
  );

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Submit a quote</h2>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="grid-2">
        {input('supplier_name', 'Supplier (your company)', { placeholder: 'e.g. Acme Freight' })}
        {input('carrier_name', 'Carrier name', { placeholder: 'e.g. BlueDart' })}
      </div>
      <div className="grid-3">
        {input('freight_charges', 'Freight charges', { type: 'number', min: 0, step: '0.01' })}
        {input('origin_charges', 'Origin charges', { type: 'number', min: 0, step: '0.01' })}
        {input('destination_charges', 'Destination charges', { type: 'number', min: 0, step: '0.01' })}
      </div>
      <div className="grid-2">
        {input('transit_time_days', 'Transit time (days)', { type: 'number', min: 1, step: 1 })}
        {input('quote_validity_date', 'Quote valid until', { type: 'date' })}
      </div>
      <div className="row-between">
        <div>Total quote: <b className="total">{money(total)}</b></div>
        <button className="btn btn-primary" disabled={disabled || saving}>{saving ? 'Submitting…' : 'Submit bid'}</button>
      </div>
      <p className="hint">You can only lower your own previous bid. Rank is decided by the lowest total.</p>
    </form>
  );
}
