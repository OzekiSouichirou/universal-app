const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

loginBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const remember = document.getElementById('remember').checked;

  if (!username || !password) {
    errorMsg.style.color = 'var(--red)';
    errorMsg.textContent = 'ユーザー名とパスワードを入力してください';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '接続中...';
  errorMsg.style.color = 'var(--text-3)';
  errorMsg.textContent = 'サーバーに接続しています。初回は時間がかかる場合があります...';

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember })
    });
    const json = await res.json().catch(() => null);

    // v0.9.0統一レスポンス形式に対応
    const ok   = json?.success === true  ? json.data   : null;
    const errMsg = json?.success === false ? json.error?.message : null;

    if (!res.ok || !ok) {
      errorMsg.style.color = 'var(--red)';
      errorMsg.textContent = errMsg || json?.detail || 'ログインに失敗しました';
      loginBtn.disabled = false;
      loginBtn.textContent = 'ログイン';
      return;
    }

    if (remember) {
      localStorage.setItem('access_token', ok.access_token);
      localStorage.setItem('role', ok.role);
    } else {
      sessionStorage.setItem('access_token', ok.access_token);
      sessionStorage.setItem('role', ok.role);
    }

    window.location.href = ok.role === 'admin' ? 'dashboard.html' : 'home.html';

  } catch (e) {
    errorMsg.style.color = 'var(--red)';
    errorMsg.textContent = 'サーバーに接続できません。しばらく待ってから再試行してください。';
    loginBtn.disabled = false;
    loginBtn.textContent = 'ログイン';
  }
});
