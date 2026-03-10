const token = localStorage.getItem('access_token');
const role = localStorage.getItem('role');

// 未ログインならログイン画面へ
if (!token) {
  window.location.href = 'index.html';
}

document.getElementById('current-user').textContent = role === 'admin' ? '管理者' : 'ユーザー';

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
});