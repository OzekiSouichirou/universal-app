const token = localStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;

  document.getElementById('current-user').textContent = user.username;

  const res = await fetch(`${API}/users/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const users = await res.json();

  document.getElementById('total-users').textContent = users.length;
  document.getElementById('total-admins').textContent = users.filter(u => u.role === 'admin').length;
  document.getElementById('total-members').textContent = users.filter(u => u.role === 'user').length;
}

init();