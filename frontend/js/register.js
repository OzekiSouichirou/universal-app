var API = window._POLONIX_API || (window.location.hostname === 'localhost' ? 'http://127.0.0.1:8000' : 'https://polonix-api-sod4.onrender.com');
const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');

registerBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();

  if (!username || !password || !confirm) {
    errorMsg.style.color = '#f0476c';
    errorMsg.textContent = 'すべての項目を入力してください';
    return;
  }

  if (password !== confirm) {
    errorMsg.style.color = '#f0476c';
    errorMsg.textContent = 'パスワードが一致しません';
    return;
  }

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorMsg.style.color = '#f0476c';
      errorMsg.textContent = data.detail;
      return;
    }

    errorMsg.style.color = '#3ecf8e';
    errorMsg.textContent = '登録完了！ログイン画面に移動します...';
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);

  } catch (e) {
    errorMsg.style.color = '#f0476c';
    errorMsg.textContent = 'サーバーに接続できません';
  }
});