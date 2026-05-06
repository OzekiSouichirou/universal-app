document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';


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
// ================================================================
// /users/me はページ遷移ごとに叩かれる最頻エンドポイント。
// api() 経由にすることで TTLキャッシュ（60秒）が適用され、
// 連続したページ遷移で Singapore への往復が発生しなくなる。
// ================================================================
async function checkAuth(requireAdmin = false) {
  showSpinner();
  const t = token();
  if (!t) {
    window.location.href = 'index.html';
    return null;
  }

  let user = null;
  try {
    // api() 経由: TTLキャッシュ60秒が効く / 401で自動ログアウト
    user = await api('/users/me');
  } catch (e) {
    // 401 は api() 内でリダイレクト済みなので、それ以外のエラーのみ処理
    if (e?.status !== 401) {
      // ネットワークエラー時: 1回リトライ（最大1秒待ち）
      await new Promise(r => setTimeout(r, 1000));
      try {
        user = await api('/users/me');
      } catch {
        console.warn('checkAuth: network error');
        hideSpinner();
        return null;
      }
    }
    return null;
  }

  if (!user?.username) {
    console.warn('checkAuth: unexpected response', user);
    hideSpinner();
    return null;
  }

  if (requireAdmin && user.role !== 'admin') {
    window.location.href = 'home.html';
    return null;
  }

  hideSpinner();
  return user;
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('role');
  // ログアウト時にキャッシュも全クリア
  if (typeof clearApiCache === 'function') clearApiCache();
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

  const open  = () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', () =>
    sidebar.classList.contains('open') ? close() : open()
  );
  overlay.addEventListener('click', close);
  sidebar.querySelectorAll('nav a').forEach(a => a.addEventListener('click', close));

  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.addEventListener('click', pwaInstall);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const syncLabel = () => {
      themeBtn.textContent = document.documentElement.dataset.theme === 'light'
        ? 'ダークモードに切り替え' : 'ライトモードに切り替え';
    };
    syncLabel();
    themeBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('theme', next);
      syncLabel();
    });
  }
});

// ============================================================
// Service Worker 登録
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
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
