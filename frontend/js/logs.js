const API = 'http://127.0.0.1:8000';
const token = localStorage.getItem('access_token');
const role = localStorage.getItem('role');

if (!token || role !== 'admin') {
  window.location.href = 'index.html';
}

document.getElementById('current-user').textContent = '管理者';

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
});

async function fetchLogs() {
  const res = await fetch(`${API}/logs/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const logs = await res.json();
  const tbody = document.getElementById('log-list');
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#8b949e;">ログはありません</td></tr>';
    return;
  }

  logs.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.created_at).toLocaleString('ja-JP')}</td>
      <td>${l.username}</td>
      <td>${l.action}</td>
      <td>${l.detail || '---'}</td>
    `;
    tbody.appendChild(tr);
  });
}

fetchLogs();