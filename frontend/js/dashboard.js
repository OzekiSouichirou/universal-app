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

async function loadDashboard() {
  const res = await fetch(`${API}/users/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const users = await res.json();

  document.getElementById('total-users').textContent = users.length;
  document.getElementById('total-admins').textContent = users.filter(u => u.role === 'admin').length;
  document.getElementById('total-members').textContent = users.filter(u => u.role === 'user').length;
}

loadDashboard();