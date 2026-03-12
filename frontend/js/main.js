const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api-sod4.onrender.com';

const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

loginBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const remember = document.getElementById('remember').checked;

  if (!username || !password) {
    errorMsg.style.color = '#f0476c';
    errorMsg.textContent = 'ユーザー名とパスワードを入力してください';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '接続中...';
  errorMsg.style.color = '#7a87aa';
  errorMsg.textContent = 'サーバーに接続しています。初回は時間がかかる場合があります...';

  try {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember })
    });

    const data = await response.json();

    if (!response.ok) {
      errorMsg.style.color = '#f0476c';
      errorMsg.textContent = data.detail || 'ログインに失敗しました';
      loginBtn.disabled = false;
      loginBtn.textContent = 'ログイン';
      return;
    }

    if (remember) {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('role', data.role);
    } else {
      sessionStorage.setItem('access_token', data.access_token);
      sessionStorage.setItem('role', data.role);
    }

    if (data.role === 'admin') {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'home.html';
    }

  } catch (e) {
    errorMsg.style.color = '#f0476c';
    errorMsg.textContent = 'サーバーに接続できません。しばらく待ってから再試行してください。';
    loginBtn.disabled = false;
    loginBtn.textContent = 'ログイン';
  }
});