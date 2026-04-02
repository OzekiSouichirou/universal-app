document.getElementById('logout-btn').addEventListener('click', logout);

function avatarHtml(username, avatar) {
  const initial = username.charAt(0).toUpperCase();
  return avatar
    ? `<div class="post-avatar"><img src="${avatar}" alt="${initial}"></div>`
    : `<div class="post-avatar">${initial}</div>`;
}

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  load();
}

async function load() {
  const users = await api('/users/').catch(() => []);
  render(Array.isArray(users) ? users : []);
}

function render(users) {
  const tbody = document.getElementById('user-list');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="ID">${u.id}</td>
      <td data-label="ユーザー名">
        <div style="display:flex;align-items:center;gap:8px;">
          ${avatarHtml(u.username, u.avatar)}${u.username}
        </div>
      </td>
      <td data-label="固有ID" style="color:var(--text-2);font-family:monospace;">${u.user_id||'---'}</td>
      <td data-label="権限">
        <select class="role-select" data-id="${u.id}">
          <option value="user"  ${u.role==='user' ?'selected':''}>一般ユーザー</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>管理者</option>
        </select>
      </td>
      <td data-label="作成日">${new Date(u.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</td>
      <td data-label="操作"><button class="btn-danger" data-id="${u.id}">削除</button></td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      try { await api(`/users/${e.target.dataset.id}/role`, { method:'PATCH', body:JSON.stringify({ role:e.target.value }) }); }
      catch(err) { console.warn('role error:', err); }
    });
  });

  document.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このユーザーを削除しますか？')) return;
      try { await api(`/users/${btn.dataset.id}`, { method:'DELETE' }); load(); }
      catch(e) { alert(e.message || '削除に失敗しました'); }
    });
  });
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  document.getElementById('modal').classList.remove('hidden');
});
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('modal-submit').addEventListener('click', async () => {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value.trim();
  const role     = document.getElementById('new-role').value;
  if (!username || !password) { alert('ユーザー名とパスワードを入力してください'); return; }
  try {
    await api('/users/', { method:'POST', body:JSON.stringify({ username, password, role }) });
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
    load();
  } catch(e) { alert(e.message || '作成に失敗しました'); }
});

init();
