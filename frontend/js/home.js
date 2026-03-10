const API = 'http://127.0.0.1:8000';
const token = localStorage.getItem('access_token');

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

async function loadNotices() {
  const res = await fetch(`${API}/notices/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const notices = await res.json();
  const list = document.getElementById('notice-list');
  list.innerHTML = '';

  if (notices.length === 0) {
    list.innerHTML = '<li class="notice-item">現在お知らせはありません</li>';
    return;
  }

  notices.forEach(n => {
    const li = document.createElement('li');
    li.className = 'notice-item';
    li.textContent = n.title;
    list.appendChild(li);
  });
}

loadUser();
loadNotices();