const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8000'
  : 'https://polonix-api.onrender.com';

const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

loginBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    errorMsg.textContent = 'ユーザー名とパスワードを入力してください';
    return;
  }

  try {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errorMsg.textContent = data.detail || 'ログインに失敗しました';
      return;
    }

    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('role', data.role);

    if (data.role === 'admin') {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'home.html';
    }

  } catch (e) {
    errorMsg.textContent = 'サーバーに接続できません';
  }
});