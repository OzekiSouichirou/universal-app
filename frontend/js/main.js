const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');

loginBtn.addEventListener('click', () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    errorMsg.textContent = 'ユーザー名とパスワードを入力してください';
    return;
  }

  // バックエンドAPI接続後に実装
  errorMsg.textContent = '現在バックエンド未接続です';
});