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

// ============================================================
// JWTトークン自動リフレッシュ
// 残り30分以下になったら自動で延長する
// ============================================================
function _tokenExp() {
  const t = token();
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch { return null; }
}

async function _refreshIfNeeded() {
  const exp = _tokenExp();
  if (!exp) return;
  const remaining = exp - Date.now();
  if (remaining > 30 * 60 * 1000) return; // 残り30分超なら不要

  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json?.success && json.data?.access_token) {
      const newToken = json.data.access_token;
      if (localStorage.getItem('access_token')) {
        localStorage.setItem('access_token', newToken);
      } else {
        sessionStorage.setItem('access_token', newToken);
      }
    }
  } catch { /* リフレッシュ失敗は無視（次回ログイン時に対処） */ }
}

// ============================================================
// APIリクエスト共通
// ============================================================
async function api(path, options = {}) {
  await _refreshIfNeeded();

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

// ============================================================
// トースト通知
// ============================================================
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

// ============================================================
// PWAインストールプロンプト
// ============================================================
let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
  toast('アプリをインストールしました！', 'success');
});

function pwaInstall() {
  if (!_installPrompt) return;
  _installPrompt.prompt();
  _installPrompt.userChoice.then(() => { _installPrompt = null; });
}
