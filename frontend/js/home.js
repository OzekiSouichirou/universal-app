async function init() {
  const user = await checkAuth(false);
  if (!user) return;

  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-name').textContent = user.username;

  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  const res = await fetch(`${API}/notices/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();
  const notices = Array.isArray(data) ? data : [];
  const container = document.getElementById('notices-container');

  if (notices.length === 0) {
    container.innerHTML = '<p>現在お知らせはありません</p>';
    return;
  }

  container.innerHTML = notices.map(n => `
    <div class="notice-item">
      <h4>${n.title}</h4>
      <p>${n.content}</p>
    </div>
  `).join('');
}

init();