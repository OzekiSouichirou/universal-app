const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');

registerBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();

  if (!username || !password || !confirm) {
    errorMsg.style.color = '#f85149';
    errorMsg.textContent = 'すべての項目を入力してください';
    return;
  }

  if (password !== confirm) {
    errorMsg.style.color = '#f85149';
    errorMsg.textContent = 'パスワードが一致しません';
    return;
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      errorMsg.style.color = '#f85149';
      errorMsg.textContent = data.detail;
      return;
    }

    errorMsg.style.color = '#3fb950';
    errorMsg.textContent = '登録完了！ログイン画面に移動します...';
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);

  } catch (e) {
    errorMsg.style.color = '#f85149';
    errorMsg.textContent = 'サーバーに接続できません';
  }
});