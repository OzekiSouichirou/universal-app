/**
 * Polonix v0.9.0 - フロントAPI共通ユーティリティ
 * - 統一レスポンス形式 {success, data/error} に対応
 * - エラーハンドリング統一
 * - ローディング状態管理
 * frontend/js/api.js に配置
 */

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api-sod4.onrender.com';

function getToken() {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function authHeaders(extra = {}) {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...extra };
}

/**
 * APIリクエストの共通処理
 * @returns {Promise<any>} レスポンスの data フィールド
 * @throws {ApiError} 失敗時
 */
async function apiRequest(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: authHeaders(),
      ...options,
    });
    const json = await res.json().catch(() => null);

    // 統一レスポンス形式
    if (json && typeof json.success !== 'undefined') {
      if (json.success) return json.data;
      const e = json.error || {};
      throw new ApiError(e.code || 'UNKNOWN', e.message || 'エラーが発生しました', res.status);
    }

    // 旧形式（移行期間対応）
    if (!res.ok) {
      const msg = json?.detail || `HTTP ${res.status}`;
      throw new ApiError(`HTTP_${res.status}`, typeof msg === 'string' ? msg : JSON.stringify(msg), res.status);
    }
    return json;

  } catch (e) {
    if (e instanceof ApiError) throw e;
    // ネットワークエラー
    throw new ApiError('NETWORK_ERROR', 'ネットワークエラーが発生しました。接続を確認してください。', 0);
  }
}

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code    = code;
    this.status  = status;
    this.name    = 'ApiError';
  }
}

/**
 * ローディング状態を管理しながらAPIを実行
 * @param {Function} fn - async関数
 * @param {Object} opts - { loadingEl, errorEl, onSuccess, onError }
 */
async function withLoading(fn, { loadingEl = null, errorEl = null, onSuccess = null, onError = null } = {}) {
  if (loadingEl) loadingEl.style.display = 'block';
  if (errorEl)   errorEl.textContent = '';
  try {
    const result = await fn();
    if (onSuccess) onSuccess(result);
    return result;
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : 'エラーが発生しました';
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.color = 'var(--red)';
    }
    if (onError) onError(e);
    else console.error('[API Error]', e.code, e.message);
    return null;
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

/**
 * 401エラー時に自動ログアウト
 */
async function apiFetch(path, options = {}) {
  try {
    return await apiRequest(`${API}${path}`, options);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      localStorage.removeItem('access_token');
      sessionStorage.removeItem('access_token');
      window.location.href = 'index.html';
    }
    if (e instanceof ApiError && e.status === 429) {
      showToast('リクエストが多すぎます。しばらく待ってから再試行してください。', 'error');
    }
    throw e;
  }
}

/**
 * シンプルなトースト通知
 */
function showToast(message, type = 'info') {
  const existing = document.getElementById('polonix-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'polonix-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--surface)',
    color: 'var(--text)', padding: '10px 20px', borderRadius: 'var(--r)',
    fontSize: '13px', fontWeight: '600', zIndex: '9999',
    border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
