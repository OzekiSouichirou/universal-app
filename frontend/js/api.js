window._POLONIX_API = window._POLONIX_API || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://polonix-api-sod4.onrender.com'
);
var API = window._POLONIX_API;

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code   = code;
    this.status = status;
    this.name   = 'ApiError';
  }
}

function token() {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function headers(extra = {}) {
  return { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', ...extra };
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers: headers(), ...options });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'ネットワークエラーが発生しました。接続を確認してください。', 0);
  }

  const json = await res.json().catch(() => null);

  if (json && typeof json.success !== 'undefined') {
    if (json.success) return json.data;
    const e = json.error || {};
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      sessionStorage.removeItem('access_token');
      window.location.href = 'index.html';
    }
    if (res.status === 429) toast('リクエストが多すぎます。しばらく待ってから再試行してください。', 'error');
    throw new ApiError(e.code || 'UNKNOWN', e.message || 'エラーが発生しました', res.status);
  }

  if (!res.ok) {
    const msg = json?.detail || `HTTP ${res.status}`;
    throw new ApiError(`HTTP_${res.status}`, typeof msg === 'string' ? msg : JSON.stringify(msg), res.status);
  }
  return json;
}

function toast(message, type = 'info') {
  const el = document.getElementById('polonix-toast');
  if (el) el.remove();
  const t = document.createElement('div');
  t.id = 'polonix-toast';
  t.textContent = message;
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--surface)',
    color: 'var(--text)', padding: '10px 20px', borderRadius: 'var(--r)',
    fontSize: '13px', fontWeight: '600', zIndex: '9999',
    border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}
