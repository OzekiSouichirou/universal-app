const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api-sod4.onrender.com';

async function checkAuth(requireAdmin = false) {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  if (!token) {
    window.location.href = 'index.html';
    return null;
  }

  try {
    const res = await fetch(`${API}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('role');
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('role');
      window.location.href = 'index.html';
      return null;
    }

    const user = await res.json();

    if (requireAdmin && user.role !== 'admin') {
      window.location.href = 'home.html';
      return null;
    }

    return user;

  } catch (e) {
    window.location.href = 'index.html';
    return null;
  }
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
