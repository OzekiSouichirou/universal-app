const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let avatars = {};

document.getElementById('logout-btn').addEventListener('click', logout);

function avatarHtml(username) {
  const av = avatars[username];
  const initial = username.charAt(0).toUpperCase();
  if (av) {
    return `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`;
  }
  return `<div class="post-avatar">${initial}</div>`;
}

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  const avRes = await fetch(`${API}/users/avatars`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  avatars = await avRes.json();
  fetchLogs();
}

async function fetchLogs() {
  const res = await fetch(`${API}/logs/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const lR = await res.json();
  const data = parseResponse(lR, {});
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
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          ${avatarHtml(l.username)}
          ${l.username}
        </div>
      </td>
      <td>${l.action}</td>
      <td>${l.detail || '---'}</td>
    `;
    tbody.appendChild(tr);
  });
}

init();
