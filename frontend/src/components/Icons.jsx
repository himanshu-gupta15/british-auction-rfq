const base = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const I = (d, { size = 16, sw = 2, ...rest } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={sw} {...base} {...rest}>
    {[].concat(d).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

export const LogoIcon = () => I(['M3 17l6-6 4 4 8-8', 'M15 7h6v6'], { size: 18, stroke: '#FFFFFF' });
export const PlusIcon = () => I('M12 5v14M5 12h14', { sw: 2.5 });
export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...base}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const TimerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.2" {...base}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
);
export const CheckIcon = () => I('M20 6L9 17l-5-5', { size: 18, sw: 2.2 });
export const AlertIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.2" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
);
export const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...base} stroke="#1D4ED8" style={{ flex: 'none', marginTop: 1 }}>
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);
export const FEED_ICONS = {
  TIME_EXTENDED: 'M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  BID_SUBMITTED: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  RFQ_CREATED: 'M14 3H6v18h12V7zM14 3v4h4',
};
export const FeedIcon = ({ type }) => I(FEED_ICONS[type] || FEED_ICONS.RFQ_CREATED, { size: 14, sw: 2.2 });
