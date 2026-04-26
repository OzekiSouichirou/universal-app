// ============================================================
// ローディングスピナー
// ============================================================
function showSpinner() {
  const el = document.getElementById('page-spinner');
  if (el) el.style.display = 'flex';
}

function hideSpinner() {
  const el = document.getElementById('page-spinner');
  if (el) el.style.display = 'none';
}

// ============================================================
// 認証
// ============================================================
async function checkAuth(requireAdmin = false) {
  showSpinner();
  const t = token();
  if (!t) { window.location.href = 'index.html'; return null; }

  try { await fetch(`${API}/`, { method: 'GET' }); } catch (_) {}

  let res = null;
  for (let i = 0; i < 3; i++) {
    try {
      res = await fetch(`${API}/users/me`, { headers: { 'Authorization': `Bearer ${t}` } });
      break;
    } catch {
      if (i < 2) await new Promise(r => setTimeout(r, 3000));
      else { console.warn('checkAuth: network error'); hideSpinner(); return null; }
    }
  }

  if (!res) { hideSpinner(); return null; }

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('role');
    window.location.href = 'index.html';
    return null;
  }

  if (!res.ok) { console.warn('checkAuth: server error', res.status); hideSpinner(); return null; }

  const json = await res.json().catch(() => null);
  const user = json?.success === true ? json.data : json;

  if (!user?.username) { console.warn('checkAuth: unexpected response', json); hideSpinner(); return null; }
  if (requireAdmin && user.role !== 'admin') { window.location.href = 'home.html'; return null; }

  hideSpinner();
  return user;
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('role');
  window.location.href = 'index.html';
}

// ============================================================
// ハンバーガーメニュー
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger-btn');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger || !sidebar || !overlay) return;

  const open  = () => { sidebar.classList.add('open'); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; };
  const close = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); document.body.style.overflow = ''; };

  hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
  overlay.addEventListener('click', close);
  sidebar.querySelectorAll('nav a').forEach(a => a.addEventListener('click', close));

  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.addEventListener('click', pwaInstall);
});

// ============================================================
// Service Worker 登録（ルート配置の /sw.js を使用）
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // 過去の誤登録（/js/sw.js）が残っていれば破棄
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
        if (url.includes('/js/sw.js')) await r.unregister();
      }
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch (e) {
      console.warn('SW register failed:', e);
    }
  });
}
