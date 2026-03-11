async function init() {
  const user = await checkAuth(true);
  if (!user) return;

  document.getElementById('current-user').textContent = user.username;

  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

  const res = await fetch(`${API}/users/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await res.json();
  const users = Array.isArray(data) ? data : [];

  document.getElementById('total-users').textContent = users.length;
  document.getElementById('admin-users').textContent = users.filter(u => u.role === 'admin').length;
  document.getElementById('normal-users').textContent = users.filter(u => u.role === 'user').length;
}

init();