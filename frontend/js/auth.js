// api.jsで定義済みの場合はそちらを使用、なければここで定義
if (typeof window._POLONIX_API === 'undefined') {
  window._POLONIX_API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://polonix-api-sod4.onrender.com';
}
const API = window._POLONIX_API;

async function checkAuth(requireAdmin = false) {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  if (!token) {
    window.location.href = 'index.html';
    return null;
  }

  // Renderスリープ明けのwarmup（/にGETしてから/users/meを叩く）
  try { await fetch(`${API}/`, { method: 'GET' }); } catch (_) {}

  // リトライ付きfetch
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${API}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      break;
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.warn('checkAuth: network error after 3 attempts');
        return null;
      }
    }
  }

  if (!res) return null;

  // 401 = トークン無効・期限切れ
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('role');
    window.location.href = 'index.html';
    return null;
  }

  // その他エラーはネットワーク問題として扱う
  if (!res.ok) {
    console.warn('checkAuth: server error', res.status);
    return null;
  }

  const json = await res.json().catch(() => null);

  // v0.9.0統一レスポンス形式 {success:true, data:{...}} に対応
  // 旧形式（直接オブジェクト）にも対応
  const user = (json && json.success === true) ? json.data : json;

  if (!user || !user.username) {
    console.warn('checkAuth: unexpected response', json);
    return null;
  }

  if (requireAdmin && user.role !== 'admin') {
    window.location.href = 'home.html';
    return null;
  }

  return user;
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('role');
  window.location.href = 'index.html';
}
// ハンバーガーメニュー制御
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  sidebar.querySelectorAll('nav a').forEach(a => {
    a.addEventListener('click', closeSidebar);
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
