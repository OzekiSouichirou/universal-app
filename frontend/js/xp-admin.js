const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await loadXPList();
  await loadTitlesList();
}

async function loadXPList() {
  const res = await fetch(`${API}/users/xp/list`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return;
  const list = await res.json();

  // セレクトボックス更新
  const sel = document.getElementById('xp-target-user');
  const current = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  list.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = `${u.username}（Lv.${u.level} / ${u.xp}XP）`;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;

  // テーブル更新
  const tbody = document.getElementById('xp-list');
  tbody.innerHTML = '';
  list.forEach((u, i) => {
    const tr = document.createElement('tr');
    const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
    tr.innerHTML = `
      <td>${rankIcon}</td>
      <td><b>${u.username}</b></td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-active' : 'badge-inactive'}">${u.role === 'admin' ? '管理者' : '一般'}</span></td>
      <td><span style="color:var(--accent-2);font-weight:700;">${u.xp.toLocaleString()} XP</span></td>
      <td>Lv.${u.level}</td>
      <td>🔥 ${u.streak}日</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-primary quick-grant" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">+100</button>
        <button class="btn-danger quick-revoke" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">-100</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // クイックボタン
  document.querySelectorAll('.quick-grant').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('xp-target-user').value = btn.dataset.user;
      document.getElementById('xp-amount').value = 100;
      doGrant();
    });
  });
  document.querySelectorAll('.quick-revoke').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('xp-target-user').value = btn.dataset.user;
      document.getElementById('xp-amount').value = 100;
      doRevoke();
    });
  });
}

function getForm() {
  return {
    username: document.getElementById('xp-target-user').value,
    amount: parseInt(document.getElementById('xp-amount').value) || 0,
    reason: document.getElementById('xp-reason').value.trim(),
  };
}

function showMsg(text, isError = false) {
  const el = document.getElementById('xp-admin-msg');
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = text;
  setTimeout(() => el.textContent = '', 4000);
}

async function doGrant() {
  const { username, amount, reason } = getForm();
  if (!username) { showMsg('ユーザーを選択してください', true); return; }
  if (amount <= 0) { showMsg('XP量を正しく入力してください', true); return; }
  const res = await fetch(`${API}/users/xp/grant`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, amount, reason })
  });
  const data = await res.json();
  if (res.ok) { showMsg(`✓ ${data.message}　新XP: ${data.new_xp} (Lv.${data.new_level})`); await loadXPList(); }
  else showMsg(data.detail, true);
}

async function doRevoke() {
  const { username, amount, reason } = getForm();
  if (!username) { showMsg('ユーザーを選択してください', true); return; }
  if (amount <= 0) { showMsg('XP量を正しく入力してください', true); return; }
  if (!confirm(`${username} から ${amount}XP を没収しますか？`)) return;
  const res = await fetch(`${API}/users/xp/revoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, amount, reason })
  });
  const data = await res.json();
  if (res.ok) { showMsg(`✓ ${data.message}　新XP: ${data.new_xp} (Lv.${data.new_level})`); await loadXPList(); }
  else showMsg(data.detail, true);
}

async function doReset() {
  const { username, reason } = getForm();
  if (!username) { showMsg('ユーザーを選択してください', true); return; }
  if (!confirm(`${username} のXPを0にリセットしますか？\nこの操作は取り消せません。`)) return;
  const res = await fetch(`${API}/users/xp/reset`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, amount: 0, reason })
  });
  const data = await res.json();
  if (res.ok) { showMsg(`✓ ${data.message}`); await loadXPList(); }
  else showMsg(data.detail, true);
}

document.getElementById('xp-grant-btn').addEventListener('click', doGrant);
document.getElementById('xp-revoke-btn').addEventListener('click', doRevoke);
document.getElementById('xp-reset-btn').addEventListener('click', doReset);

init();

// ===================== 称号管理 =====================
let titlesList = [];

async function loadTitlesList() {
  const res = await fetch(`${API}/users/titles/list`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return;
  titlesList = await res.json();

  // セレクトボックス更新
  const sel = document.getElementById('title-target-user');
  const current = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  titlesList.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = u.username + (u.selected_title ? `（${u.selected_title}）` : '');
    sel.appendChild(opt);
  });
  if (current) sel.value = current;

  // テーブル更新
  const tbody = document.getElementById('title-list-tbody');
  tbody.innerHTML = titlesList.map(u => `
    <tr>
      <td><b>${u.username}</b></td>
      <td>${u.selected_title
        ? `<span style="color:var(--accent-2);font-weight:700;">${u.selected_title}</span>`
        : '<span style="color:var(--text-3);">なし</span>'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-secondary quick-title-edit" data-user="${u.username}"
          data-a="${u.selected_title_a||''}" data-b="${u.selected_title_b||''}"
          style="padding:4px 10px;font-size:12px;">編集</button>
        ${u.selected_title ? `<button class="btn-danger quick-title-revoke" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">削除</button>` : ''}
      </td>
    </tr>`).join('');

  document.querySelectorAll('.quick-title-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('title-target-user').value = btn.dataset.user;
      document.getElementById('title-a-input').value = btn.dataset.a;
      document.getElementById('title-b-input').value = btn.dataset.b;
      updateTitlePreview();
      onTitleUserChange();
    });
  });
  document.querySelectorAll('.quick-title-revoke').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`${btn.dataset.user} の称号を削除しますか？`)) return;
      const res = await fetch(`${API}/users/titles/revoke`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: btn.dataset.user, title_a:'', title_b:'', reason:'管理者による削除' })
      });
      const data = await res.json();
      showTitleMsg(res.ok ? data.message : data.detail, !res.ok);
      if (res.ok) loadTitlesList();
    });
  });
}

function onTitleUserChange() {
  const username = document.getElementById('title-target-user').value;
  const user = titlesList.find(u => u.username === username);
  const el = document.getElementById('title-current-display');
  if (user && user.selected_title) {
    el.textContent = `現在の称号：${user.selected_title}`;
  } else {
    el.textContent = username ? '現在の称号：なし' : '';
  }
}

function updateTitlePreview() {
  const a = document.getElementById('title-a-input').value.trim();
  const b = document.getElementById('title-b-input').value.trim();
  const el = document.getElementById('title-preview');
  el.textContent = (a || b) ? `👑 ${a} ${b}` : '';
}

document.getElementById('title-target-user').addEventListener('change', onTitleUserChange);
document.getElementById('title-a-input').addEventListener('input', updateTitlePreview);
document.getElementById('title-b-input').addEventListener('input', updateTitlePreview);

function showTitleMsg(text, isError=false) {
  const el = document.getElementById('title-admin-msg');
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = text;
  setTimeout(() => el.textContent = '', 4000);
}

document.getElementById('title-grant-btn').addEventListener('click', async () => {
  const username = document.getElementById('title-target-user').value;
  const title_a = document.getElementById('title-a-input').value.trim();
  const title_b = document.getElementById('title-b-input').value.trim();
  const reason = document.getElementById('title-reason').value.trim();
  if (!username) { showTitleMsg('ユーザーを選択してください', true); return; }
  if (!title_a && !title_b) { showTitleMsg('A・Bどちらかを入力してください', true); return; }
  const res = await fetch(`${API}/users/titles/grant`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, title_a, title_b, reason })
  });
  const data = await res.json();
  showTitleMsg(res.ok ? data.message : data.detail, !res.ok);
  if (res.ok) { loadTitlesList(); loadXPList(); }
});

document.getElementById('title-revoke-btn').addEventListener('click', async () => {
  const username = document.getElementById('title-target-user').value;
  const reason = document.getElementById('title-reason').value.trim();
  if (!username) { showTitleMsg('ユーザーを選択してください', true); return; }
  if (!confirm(`${username} の称号を削除しますか？`)) return;
  const res = await fetch(`${API}/users/titles/revoke`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, title_a:'', title_b:'', reason })
  });
  const data = await res.json();
  showTitleMsg(res.ok ? data.message : data.detail, !res.ok);
  if (res.ok) { loadTitlesList(); loadXPList(); }
});


