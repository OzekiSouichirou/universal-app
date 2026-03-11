async function init() {
  const user = await checkAuth(false);
  if (!user) return;

  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;

  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  const res = await fetch(`${API}/notices/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();
  const notices = Array.isArray(data) ? data : [];
  const list = document.getElementById('notice-list');

  if (notices.length === 0) {
    list.innerHTML = '<li class="notice-item">現在お知らせはありません</li>';
    return;
  }

  list.innerHTML = notices.map(n => `
    <li class="notice-item">
      <strong>${n.title}</strong>
      <p>${n.content}</p>
    </li>
  `).join('');
}

document.getElementById('logout-btn').addEventListener('click', logout);

init();