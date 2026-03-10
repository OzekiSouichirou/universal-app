const token = localStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;
  fetchNotices();
}

async function fetchNotices() {
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

init();