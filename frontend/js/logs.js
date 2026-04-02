let avatars = {};

document.getElementById('logout-btn').addEventListener('click', logout);

function avatarHtml(username) {
  const av = avatars[username]; const initial = username.charAt(0).toUpperCase();
  return av ? `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>` : `<div class="post-avatar">${initial}</div>`;
}

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  avatars = await api('/users/avatars').catch(() => ({}));
  load();
}

async function load() {
  const data = await api('/logs/').catch(() => []);
  const logs = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('log-list');
  tbody.innerHTML = '';
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#7a87aa;">ログはありません</td></tr>';
    return;
  }
  logs.forEach(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(l.created_at+'Z').toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">${avatarHtml(l.username)}${l.username}</div></td>
      <td>${l.action}</td>
      <td>${l.detail||'---'}</td>`;
    tbody.appendChild(tr);
  });
}

init();
