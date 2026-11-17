import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { TRIGGERS, TRIGGER, hhmm, localToIso, toLocalInput } from '../utils.js';
import { AlertIcon, InfoIcon } from '../components/Icons.jsx';

function defaults() {
  const now = new Date();
  now.setSeconds(0, 0);
  const plus = (min) => toLocalInput(new Date(now.getTime() + min * 60000));
  return {
    name: '',
    reference_id: `RFQ-${Date.now().toString().slice(-6)}`,
    pickup_date: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10),
    bid_start_at: plus(0),
    bid_close_at: plus(60),
    forced_bid_close_at: plus(90),
    trigger_window_minutes: '10',
    extension_minutes: '5',
    extension_trigger: 'BID_RECEIVED',
  };
}

const pct = (v) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;

/** Dark "How this auction behaves" panel, computed from the form values. */
function Preview({ form }) {
  const start = new Date(form.bid_start_at).getTime();
  const close = new Date(form.bid_close_at).getTime();
  const forced = new Date(form.forced_bid_close_at).getTime();
  const x = Math.max(1, Number(form.trigger_window_minutes) || 1);
  const y = Math.max(1, Number(form.extension_minutes) || 1);
  const valid = [start, close, forced].every(Number.isFinite) && start < close && close < forced;

  if (!valid) {
    return (
      <section className="preview">
        <div>
          <p className="preview-eyebrow">Live preview</p>
          <h2>How this auction behaves</h2>
        </div>
        <p className="preview-text">Set a bid start, bid close and a later forced close to preview the auction window.</p>
      </section>
    );
  }

  const span = forced - start;
  const at = (t) => ((t - start) / span) * 100;
  const winStart = Math.max(start, close - x * 60000);
  const extEnd = Math.min(forced, close + y * 60000);
  const durationMin = Math.round((close - start) / 60000);
  const headroomMin = Math.round((forced - close) / 60000);

  return (
    <section className="preview">
      <div>
        <p className="preview-eyebrow">Live preview</p>
        <h2>How this auction behaves</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="pv" aria-hidden="true">
          <div className="pv-track" />
          <div className="pv-sched" style={{ width: pct(at(close)) }} />
          <div className="pv-window" style={{ left: pct(at(winStart)), width: `calc(${pct(at(close))} - ${pct(at(winStart))})` }} />
          <div className="pv-ext" style={{ left: pct(at(close)), width: `calc(${pct(at(extEnd))} - ${pct(at(close))})` }} />
          <div className="pv-close" style={{ left: pct(at(close)) }} />
          <div className="pv-forced" />
        </div>
        <div className="pv-axis">
          <span>{hhmm(start)} start</span><span>{hhmm(close)} close</span><span style={{ color: '#FDA29B' }}>{hhmm(forced)} forced</span>
        </div>
        <div className="pv-legend">
          <span><span className="sw" style={{ background: '#F79009' }} />Trigger window</span>
          <span><span className="sw" style={{ background: '#7A9BFF' }} />One extension</span>
        </div>
      </div>

      <p className="preview-text">
        If <b>{TRIGGER[form.extension_trigger].phrase}</b> after <b className="mono">{hhmm(winStart)}</b> (last {x} min),
        the close moves <b className="mono">+{y} min</b>, up to <b className="mono" style={{ color: '#fff' }}>{Math.ceil(headroomMin / y)}</b>{' '}
        time{Math.ceil(headroomMin / y) === 1 ? '' : 's'} before it hits the {hhmm(forced)} hard stop.
      </p>

      <dl>
        <dt>Scheduled duration</dt><dd>{durationMin} min</dd>
        <dt>Extension headroom</dt><dd>{headroomMin} min</dd>
        <dt>Latest possible close</dt><dd style={{ color: '#FDA29B' }}>{hhmm(forced)}</dd>
      </dl>
    </section>
  );
}

export default function CreateRfq() {
  const [form, setForm] = useState(defaults);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Mirrors the server rules for instant feedback; the server stays the source of truth.
  const clientErrors = useMemo(() => {
    const e = {};
    const s = new Date(form.bid_start_at), c = new Date(form.bid_close_at), f = new Date(form.forced_bid_close_at);
    if (form.bid_close_at && form.bid_start_at && c <= s) e.bid_close_at = 'Bid close must be after bid start';
    if (form.forced_bid_close_at && form.bid_close_at && f <= c) e.forced_bid_close_at = 'Forced close must be later than bid close';
    return e;
  }, [form]);
  const err = { ...errors, ...clientErrors };

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
    } catch (ex) {
      setErrors(ex.details || {});
      setFormError(ex.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, input, hint, labelExtra) => (
    <label className="lbl">
      {labelExtra ? <span className="lbl-row">{label}{labelExtra}</span> : label}
      {input}
      {err[name] ? <span className="err-msg">{err[name]}</span> : hint && <span className="hint">{hint}</span>}
    </label>
  );
  const cls = (name, extra = '') => `inp${extra}${err[name] ? ' err' : ''}`;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Auctions</Link><span aria-hidden="true">/</span><span className="cur">New RFQ</span>
      </nav>
      <div>
        <h1>Create RFQ</h1>
        <p className="lead">Request quotes with British Auction bidding. Suppliers see live ranks and can only lower their price.</p>
      </div>

      <div className="split">
        <form className="split-main" style={{ gap: 20 }} onSubmit={submit} noValidate>
          {formError && <div className="alert alert-error" role="alert"><AlertIcon /><span>{formError}</span></div>}

          <section className="card pad">
            <div className="step"><span className="step-n">1</span><h2>Shipment details</h2></div>
            <div className="grid g-240">
              {field('name', 'RFQ name', <input className={cls('name')} value={form.name} onChange={set('name')} placeholder="e.g. Mumbai → Delhi FTL, 20 tons" />)}
              {field('reference_id', 'Reference ID', <input className={cls('reference_id', ' ref')} value={form.reference_id} onChange={set('reference_id')} />)}
              {field('pickup_date', 'Pickup / service date', <input className={cls('pickup_date')} type="date" value={form.pickup_date} onChange={set('pickup_date')} />)}
            </div>
          </section>

          <section className="card pad">
            <div className="step"><span className="step-n">2</span><h2>Bidding schedule</h2></div>
            <div className="grid g-220">
              {field('bid_start_at', 'Bid start', <input className={cls('bid_start_at')} type="datetime-local" value={form.bid_start_at} onChange={set('bid_start_at')} />)}
              {field('bid_close_at', 'Bid close', <input className={cls('bid_close_at')} type="datetime-local" value={form.bid_close_at} onChange={set('bid_close_at')} />, 'Can move later via extensions')}
              {field('forced_bid_close_at', 'Forced close', <input className={cls('forced_bid_close_at')} type="datetime-local" value={form.forced_bid_close_at} onChange={set('forced_bid_close_at')} />,
                'Never exceeded, whatever the extensions', <span className="hard-stop">HARD STOP</span>)}
            </div>
          </section>

          <section className="card pad">
            <div className="section-head">
              <div className="step"><span className="step-n">3</span><h2>Auto-extension rules</h2></div>
              <span className="badge badge-active"><span className="dot" />British Auction on</span>
            </div>
            <div className="grid g-240">
              {field('trigger_window_minutes', 'Trigger window: X (minutes)',
                <input className={cls('trigger_window_minutes', ' mono')} type="number" min="1" value={form.trigger_window_minutes} onChange={set('trigger_window_minutes')} />,
                'Activity in the last X minutes before close is watched')}
              {field('extension_minutes', 'Extension: Y (minutes)',
                <input className={cls('extension_minutes', ' mono')} type="number" min="1" value={form.extension_minutes} onChange={set('extension_minutes')} />,
                'Added to the close time each time it triggers')}
            </div>
            <fieldset>
              <legend>What triggers an extension?</legend>
              {TRIGGERS.map((t) => (
                <label key={t.key} className={`opt${form.extension_trigger === t.key ? ' on' : ''}`}>
                  <input type="radio" name="trigger" value={t.key} checked={form.extension_trigger === t.key} onChange={set('extension_trigger')} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="opt-title">{t.title}</span>
                    <span className="opt-desc">{t.desc}</span>
                  </span>
                </label>
              ))}
              {err.extension_trigger && <span className="err-msg">{err.extension_trigger}</span>}
            </fieldset>
          </section>

          <div className="form-actions">
            <Link to="/" className="btn lg">Cancel</Link>
            <button type="submit" className="btn-primary lg" disabled={saving}>{saving ? 'Creating…' : 'Create RFQ'}</button>
          </div>
        </form>

        <aside className="split-side" style={{ gap: 16 }}>
          <Preview form={form} />
          <section className="card tip">
            <InfoIcon />
            <p>Tip: keep X at least twice Y so last-minute bidders can respond to each other before the auction settles.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
