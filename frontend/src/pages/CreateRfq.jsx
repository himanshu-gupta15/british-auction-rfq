import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { TRIGGER_LABELS, localToIso, toLocalInput } from '../utils.js';

function defaults() {
  const now = new Date();
  now.setSeconds(0, 0);
  const plus = (min) => toLocalInput(new Date(now.getTime() + min * 60000));
  const pickup = new Date(now.getTime() + 7 * 86400000);
  return {
    name: '',
    reference_id: `RFQ-${Date.now().toString().slice(-6)}`,
    bid_start_at: plus(0),
    bid_close_at: plus(60),
    forced_bid_close_at: plus(90),
    pickup_date: pickup.toISOString().slice(0, 10),
    trigger_window_minutes: 10,
    extension_minutes: 5,
    extension_trigger: 'BID_RECEIVED',
  };
}

export default function CreateRfq() {
  const [form, setForm] = useState(defaults);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Client-side checks mirror the server's validation rules (server remains the source of truth).
  const clientErrors = useMemo(() => {
    const e = {};
    const s = new Date(form.bid_start_at), c = new Date(form.bid_close_at), f = new Date(form.forced_bid_close_at);
    if (form.bid_close_at && form.bid_start_at && c <= s) e.bid_close_at = 'Bid close must be after bid start';
    if (form.forced_bid_close_at && form.bid_close_at && f <= c) e.forced_bid_close_at = 'Forced close must be later than bid close';
    return e;
  }, [form]);

  const allErrors = { ...errors, ...clientErrors };

  async function submit(e) {
    e.preventDefault();
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const rfq = await api.createRfq({
        ...form,
        bid_start_at: localToIso(form.bid_start_at),
        bid_close_at: localToIso(form.bid_close_at),
        forced_bid_close_at: localToIso(form.forced_bid_close_at),
        trigger_window_minutes: Number(form.trigger_window_minutes),
        extension_minutes: Number(form.extension_minutes),
      });
      navigate(`/rfqs/${rfq.id}`);
    } catch (err) {
      setErrors(err.details || {});
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const Field = ({ name, label, hint, children }) => (
    <label className={`field ${allErrors[name] ? 'has-error' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {allErrors[name] ? <span className="error">{allErrors[name]}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );

  const X = Number(form.trigger_window_minutes) || 'X';
  const Y = Number(form.extension_minutes) || 'Y';

  return (
    <section className="narrow">
      <h1>Create RFQ</h1>
      <p className="muted">Create a Request for Quotation with British Auction bidding enabled.</p>
      {formError && <div className="alert alert-error">{formError}</div>}

      <form onSubmit={submit} noValidate>
        <div className="card">
          <h2>RFQ details</h2>
          <div className="grid-2">
            {Field({ name: 'name', label: 'RFQ name', children: <input value={form.name} onChange={set('name')} placeholder="e.g. Mumbai → Delhi FTL, 20 tons" required /> })}
            {Field({ name: 'reference_id', label: 'Reference ID', children: <input value={form.reference_id} onChange={set('reference_id')} required /> })}
            {Field({ name: 'bid_start_at', label: 'Bid start date & time', children: <input type="datetime-local" value={form.bid_start_at} onChange={set('bid_start_at')} /> })}
            {Field({ name: 'bid_close_at', label: 'Bid close date & time', children: <input type="datetime-local" value={form.bid_close_at} onChange={set('bid_close_at')} /> })}
            {Field({ name: 'forced_bid_close_at', label: 'Forced bid close date & time', hint: 'Hard stop. The auction can never be extended beyond this.', children: <input type="datetime-local" value={form.forced_bid_close_at} onChange={set('forced_bid_close_at')} /> })}
            {Field({ name: 'pickup_date', label: 'Pickup / service date', children: <input type="date" value={form.pickup_date} onChange={set('pickup_date')} /> })}
          </div>
        </div>

        <div className="card">
          <div className="row-between">
            <h2>British Auction configuration</h2>
            <span className="badge badge-active">Enabled</span>
          </div>
          <div className="grid-2">
            {Field({ name: 'trigger_window_minutes', label: 'Trigger window (X minutes)', hint: 'How close to the close time bidding activity is monitored.', children: <input type="number" min="1" value={form.trigger_window_minutes} onChange={set('trigger_window_minutes')} /> })}
            {Field({ name: 'extension_minutes', label: 'Extension duration (Y minutes)', hint: 'Time added to the close time when triggered.', children: <input type="number" min="1" value={form.extension_minutes} onChange={set('extension_minutes')} /> })}
          </div>
          {Field({
            name: 'extension_trigger',
            label: 'Extension trigger',
            children: (
              <div className="radio-group">
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <label key={value} className={`radio ${form.extension_trigger === value ? 'checked' : ''}`}>
                    <input type="radio" name="trigger" value={value} checked={form.extension_trigger === value} onChange={set('extension_trigger')} />
                    {label}
                  </label>
                ))}
              </div>
            ),
          })}
          <p className="callout">
            If the trigger happens in the last <b>{X} min</b> before close, the close time moves forward by <b>{Y} min</b>.
            It never goes past the forced close time.
          </p>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={() => navigate('/')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create RFQ'}</button>
        </div>
      </form>
    </section>
  );
}
