const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  fetchLogs();
}

async function fetchLogs() {
  const res = await fetch(`${API}/logs/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const logs = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('log-list');
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#7a87aa;">ログはありません</td></tr>';
    return;
  }

  logs.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.created_at + 'Z').toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}</td>
      <td>${l.username}</td>
      <td>${l.action}</td>
      <td>${l.detail || '---'}</td>
    `;
    tbody.appendChild(tr);
  });
}

init();