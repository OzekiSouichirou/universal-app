window._POLONIX_API = window._POLONIX_API || (
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://api.polonix.app'
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

// ================================================================
// クライアントサイド TTL キャッシュ
// ページ遷移をまたいでデータを再利用し Singapore RTT を削減する。
// ================================================================
const _cache = new Map();

// エンドポイントごとの TTL（ミリ秒）。0 = キャッシュなし。
const _CACHE_TTL = {
  '/users/me':               60_000,  // 認証情報 1分（全ページ共通）
  '/users/avatars':         300_000,  // アバター 5分
  '/users/fortune/today': 3_600_000,  // 運勢 1時間（1日1回）
  '/users/profile/':         60_000,  // 他ユーザープロフィール 1分
  '/notices/':              120_000,  // お知らせ 2分
  '/timetable/':            300_000,  // 時間割 5分（学期単位）
  '/calendar/xp':            60_000,  // XP情報 1分
  '/calendar/':              60_000,  // カレンダー 1分
  '/stats/me':               60_000,  // 個人統計 1分
  '/stats/admin':           120_000,  // 管理統計 2分
  '/tasks/':                 60_000,  // 課題 1分
  '/grades/':                60_000,  // 成績 1分
  '/badges/':               120_000,  // バッジ 2分
  '/attendance/':            60_000,  // 出席 1分
  '/bookmarks/':             60_000,  // ブックマーク 1分
  '/posts/':                 15_000,  // 投稿 15秒
  '/posts/notifications/list': 0,    // 通知（ポーリング対象）キャッシュなし
};

function _getTtl(path) {
  const base = path.split('?')[0];
  if (_CACHE_TTL[base] !== undefined) return _CACHE_TTL[base];
  for (const prefix of Object.keys(_CACHE_TTL)) {
    if (base.startsWith(prefix)) return _CACHE_TTL[prefix];
  }
  return 0;
}

function _cacheGet(path) {
  const e = _cache.get(path);
  if (!e) return null;
  if (Date.now() > e.exp) { _cache.delete(path); return null; }
  return e.data;
}

function _cacheSet(path, data) {
  const ttl = _getTtl(path);
  if (ttl > 0) _cache.set(path, { data, exp: Date.now() + ttl });
}

function _invalidate(path) {
  const base   = path.split('?')[0];
  const prefix = base.replace(/\/\d+.*$/, '/');
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix) || key === base) _cache.delete(key);
  }
}

function clearApiCache(prefix) {
  if (prefix) {
    for (const key of _cache.keys()) {
      if (key.startsWith(prefix)) _cache.delete(key);
    }
  } else {
    _cache.clear();
  }
}

// ================================================================
// JWT 自動リフレッシュ（残り 30 分以下で延長）
// ================================================================
function _tokenExp() {
  const t = token();
  if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1])).exp * 1000; }
  catch { return null; }
}

let _refreshing = false;
async function _refreshIfNeeded() {
  if (_refreshing) return;
  const exp = _tokenExp();
  if (!exp || exp - Date.now() > 30 * 60 * 1000) return;
  _refreshing = true;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json?.success && json.data?.access_token) {
      const t = json.data.access_token;
      if (localStorage.getItem('access_token')) localStorage.setItem('access_token', t);
      else sessionStorage.setItem('access_token', t);
    }
  } catch { /* ignore */ } finally { _refreshing = false; }
}

// ================================================================
// API リクエスト共通
// ================================================================
async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isRead = method === 'GET';

  // キャッシュヒット確認（GET のみ）
  if (isRead) {
    const cached = _cacheGet(path);
    if (cached !== null) return cached;
  }

  await _refreshIfNeeded();

  let res;
  try {
    res = await fetch(`${API}${path}`, { headers: headers(), ...options });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'ネットワークエラーが発生しました。接続を確認してください。', 0);
  }

  const json = await res.json().catch(() => null);

  if (json && typeof json.success !== 'undefined') {
    if (json.success) {
      if (!isRead) _invalidate(path);
      if (isRead)  _cacheSet(path, json.data);
      return json.data;
    }
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

// ================================================================
// トースト通知
// ================================================================
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

// ================================================================
// PWA インストール
// ================================================================
let _installPrompt = null;
const _ua           = navigator.userAgent.toLowerCase();
const _isIos        = /iphone|ipad|ipod/.test(_ua);
const _isSafari     = _isIos && /safari/.test(_ua) && !/crios|fxios/.test(_ua);
const _isStandalone = window.navigator.standalone === true
  || window.matchMedia('(display-mode: standalone)').matches;

function _showIosGuide() {
  if (document.getElementById('pwa-ios-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'pwa-ios-modal';
  modal.innerHTML = `
    <div class="pwa-modal-overlay" id="pwa-modal-overlay">
      <div class="pwa-modal-box">
        <div class="pwa-modal-title">📲 ホーム画面に追加</div>
        <ol class="pwa-modal-steps">
          <li>画面下部の <strong>共有ボタン（□↑）</strong> をタップ</li>
          <li>「<strong>ホーム画面に追加</strong>」を選択</li>
          <li>右上の「<strong>追加</strong>」をタップ</li>
        </ol>
        <button class="pwa-modal-close" id="pwa-modal-close">閉じる</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('pwa-modal-close').addEventListener('click', () => modal.remove());
  document.getElementById('pwa-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) modal.remove();
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  if (!_isStandalone) _showInstallBtn();
});

window.addEventListener('appinstalled', () => {
  _installPrompt = null;
  _hideInstallBtn();
  toast('アプリをインストールしました！', 'success');
});

function _showInstallBtn() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'block';
}

function _hideInstallBtn() {
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
}

if (_isSafari && !_isStandalone) {
  window.addEventListener('DOMContentLoaded', _showInstallBtn);
}

function pwaInstall() {
  if (_installPrompt) {
    _installPrompt.prompt();
    _installPrompt.userChoice.then(() => { _installPrompt = null; });
  } else if (_isSafari) {
    _showIosGuide();
  }
}
