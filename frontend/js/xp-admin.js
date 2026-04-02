document.getElementById('logout-btn').addEventListener('click', logout);

let titlesList = [];

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await loadXP();
  await loadTitles();
}

async function loadXP() {
  const list = await api('/users/xp/list').catch(() => []);
  const sel  = document.getElementById('xp-target-user');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  list.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username; opt.textContent = `${u.username}（Lv.${u.level} / ${u.xp}XP）`;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;

  const tbody = document.getElementById('xp-list');
  tbody.innerHTML = '';
  list.forEach((u, i) => {
    const rank = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
    const tr   = document.createElement('tr');
    tr.innerHTML = `
      <td>${rank}</td>
      <td><b>${u.username}</b></td>
      <td><span class="badge ${u.role==='admin'?'badge-active':'badge-inactive'}">${u.role==='admin'?'管理者':'一般'}</span></td>
      <td><span style="color:var(--accent-2);font-weight:700;">${u.xp.toLocaleString()} XP</span></td>
      <td>Lv.${u.level}</td>
      <td>🔥 ${u.streak}日</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-primary quick-grant" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">+100</button>
        <button class="btn-danger quick-revoke" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">-100</button>
      </td>`;
    tbody.appendChild(tr);
  });

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

function form() {
  return {
    username: document.getElementById('xp-target-user').value,
    amount:   parseInt(document.getElementById('xp-amount').value) || 0,
    reason:   document.getElementById('xp-reason').value.trim(),
  };
}

function msg(text, isError=false) {
  const el = document.getElementById('xp-admin-msg');
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = text;
  setTimeout(() => el.textContent='', 4000);
}

async function doGrant() {
  const { username, amount, reason } = form();
  if (!username) { msg('ユーザーを選択してください', true); return; }
  if (amount<=0) { msg('XP量を正しく入力してください', true); return; }
  try {
    const data = await api('/users/xp/grant', { method:'POST', body:JSON.stringify({ username, amount, reason }) });
    msg(`✓ ${data.message}　新XP: ${data.new_xp} (Lv.${data.new_level})`);
    await loadXP();
  } catch(e) { msg(e.message||'失敗しました', true); }
}

async function doRevoke() {
  const { username, amount, reason } = form();
  if (!username) { msg('ユーザーを選択してください', true); return; }
  if (amount<=0) { msg('XP量を正しく入力してください', true); return; }
  if (!confirm(`${username} から ${amount}XP を没収しますか？`)) return;
  try {
    const data = await api('/users/xp/revoke', { method:'POST', body:JSON.stringify({ username, amount, reason }) });
    msg(`✓ ${data.message}　新XP: ${data.new_xp} (Lv.${data.new_level})`);
    await loadXP();
  } catch(e) { msg(e.message||'失敗しました', true); }
}

async function doReset() {
  const { username, reason } = form();
  if (!username) { msg('ユーザーを選択してください', true); return; }
  if (!confirm(`${username} のXPを0にリセットしますか？\nこの操作は取り消せません。`)) return;
  try {
    const data = await api('/users/xp/reset', { method:'POST', body:JSON.stringify({ username, amount:0, reason }) });
    msg(`✓ ${data.message}`);
    await loadXP();
  } catch(e) { msg(e.message||'失敗しました', true); }
}

document.getElementById('xp-grant-btn').addEventListener('click', doGrant);
document.getElementById('xp-revoke-btn').addEventListener('click', doRevoke);
document.getElementById('xp-reset-btn').addEventListener('click', doReset);

async function loadTitles() {
  titlesList = await api('/users/titles/list').catch(() => []);
  const sel  = document.getElementById('title-target-user');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">選択してください</option>';
  titlesList.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username; opt.textContent = u.username + (u.selected_title?`（${u.selected_title}）`:'');
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;

  const tbody = document.getElementById('title-list-tbody');
  tbody.innerHTML = titlesList.map(u => `
    <tr>
      <td><b>${u.username}</b></td>
      <td>${u.selected_title
        ?`<span style="color:var(--accent-2);font-weight:700;">${u.selected_title}</span>`
        :'<span style="color:var(--text-3);">なし</span>'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-secondary quick-title-edit" data-user="${u.username}"
          data-a="${u.selected_title_a||''}" data-b="${u.selected_title_b||''}"
          style="padding:4px 10px;font-size:12px;">編集</button>
        ${u.selected_title?`<button class="btn-danger quick-title-revoke" data-user="${u.username}" style="padding:4px 10px;font-size:12px;">削除</button>`:''}
      </td>
    </tr>`).join('');

  document.querySelectorAll('.quick-title-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('title-target-user').value = btn.dataset.user;
      document.getElementById('title-a-input').value     = btn.dataset.a;
      document.getElementById('title-b-input').value     = btn.dataset.b;
      updatePreview(); onUserChange();
    });
  });
  document.querySelectorAll('.quick-title-revoke').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`${btn.dataset.user} の称号を削除しますか？`)) return;
      try {
        const data = await api('/users/titles/revoke', { method:'POST', body:JSON.stringify({ username:btn.dataset.user, title_a:'', title_b:'', reason:'管理者による削除' }) });
        titleMsg(data.message); loadTitles();
      } catch(e) { titleMsg(e.message||'失敗しました', true); }
    });
  });
}

function onUserChange() {
  const username = document.getElementById('title-target-user').value;
  const user     = titlesList.find(u => u.username===username);
  const el       = document.getElementById('title-current-display');
  el.textContent = user?.selected_title ? `現在の称号：${user.selected_title}` : (username?'現在の称号：なし':'');
}

function updatePreview() {
  const a = document.getElementById('title-a-input').value.trim();
  const b = document.getElementById('title-b-input').value.trim();
  document.getElementById('title-preview').textContent = (a||b) ? `👑 ${a} ${b}` : '';
}

function titleMsg(text, isError=false) {
  const el = document.getElementById('title-admin-msg');
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.textContent = text;
  setTimeout(() => el.textContent='', 4000);
}

document.getElementById('title-target-user').addEventListener('change', onUserChange);
document.getElementById('title-a-input').addEventListener('input', updatePreview);
document.getElementById('title-b-input').addEventListener('input', updatePreview);

document.getElementById('title-grant-btn').addEventListener('click', async () => {
  const username = document.getElementById('title-target-user').value;
  const title_a  = document.getElementById('title-a-input').value.trim();
  const title_b  = document.getElementById('title-b-input').value.trim();
  const reason   = document.getElementById('title-reason').value.trim();
  if (!username)      { titleMsg('ユーザーを選択してください', true); return; }
  if (!title_a&&!title_b) { titleMsg('A・Bどちらかを入力してください', true); return; }
  try {
    const data = await api('/users/titles/grant', { method:'POST', body:JSON.stringify({ username, title_a, title_b, reason }) });
    titleMsg(data.message); loadTitles(); loadXP();
  } catch(e) { titleMsg(e.message||'失敗しました', true); }
});

document.getElementById('title-revoke-btn').addEventListener('click', async () => {
  const username = document.getElementById('title-target-user').value;
  const reason   = document.getElementById('title-reason').value.trim();
  if (!username) { titleMsg('ユーザーを選択してください', true); return; }
  if (!confirm(`${username} の称号を削除しますか？`)) return;
  try {
    const data = await api('/users/titles/revoke', { method:'POST', body:JSON.stringify({ username, title_a:'', title_b:'', reason }) });
    titleMsg(data.message); loadTitles(); loadXP();
  } catch(e) { titleMsg(e.message||'失敗しました', true); }
});

init();
