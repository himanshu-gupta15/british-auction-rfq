const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  return data;
}

export const api = {
  listRfqs: () => request('/rfqs'),
  getRfq: (id) => request(`/rfqs/${id}`),
  createRfq: (body) => request('/rfqs', { method: 'POST', body: JSON.stringify(body) }),
  submitBid: (id, body) => request(`/rfqs/${id}/bids`, { method: 'POST', body: JSON.stringify(body) }),
};
