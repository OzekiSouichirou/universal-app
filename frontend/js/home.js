const API = 'http://127.0.0.1:8000';
const token = localStorage.getItem('access_token');
const role = localStorage.getItem('role');

if (!token) {
  window.location.href = 'index.html';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
});

async function loadUser() {
  const res = await fetch(`${API}/users/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const user = await res.json();
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;
}

loadUser();