import { STATUS_LABELS } from '../utils.js';

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <span className="dot" />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
