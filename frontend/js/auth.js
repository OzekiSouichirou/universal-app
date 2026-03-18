const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api-sod4.onrender.com';

async function checkAuth(requireAdmin = false) {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  if (!token) {
    window.location.href = 'index.html';
    return null;
  }

  // リトライ付きfetch（Renderスリープ対応）
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${API}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      break; // 成功したらループ抜ける
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000)); // 2秒待って再試行
      } else {
        // 3回失敗 = ネットワークエラー。トークンは有効かもしれないので
        // ログイン画面には飛ばさずnullを返す（各ページで対処）
        console.warn('checkAuth: network error after 3 attempts');
        return null;
      }
    }
  }

  if (!res) return null;

  // 401 = トークン無効・期限切れ → ログイン画面へ
  if (res.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('role');
    window.location.href = 'index.html';
    return null;
  }

  // その他のエラー（500など）はネットワーク問題として扱う
  if (!res.ok) {
    console.warn('checkAuth: server error', res.status);
    return null;
  }

  const user = await res.json();

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
