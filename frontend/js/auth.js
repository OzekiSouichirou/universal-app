async function checkAuth(requireAdmin = false) {
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
      else { console.warn('checkAuth: network error'); return null; }
    }
  }

  if (!res) return null;

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('role');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('role');
    window.location.href = 'index.html';
    return null;
  }

  if (!res.ok) { console.warn('checkAuth: server error', res.status); return null; }

  const json = await res.json().catch(() => null);
  const user = json?.success === true ? json.data : json;

  if (!user?.username) { console.warn('checkAuth: unexpected response', json); return null; }
  if (requireAdmin && user.role !== 'admin') { window.location.href = 'home.html'; return null; }

  return user;
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('role');
  window.location.href = 'index.html';
}

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
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
