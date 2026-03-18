const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let currentOp = 'add';

document.getElementById('logout-btn').addEventListener('click', logout);

// 操作ボタン切り替え
document.querySelectorAll('.xp-op-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.xp-op-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentOp = btn.dataset.op;
    const label = currentOp === 'add' ? '配布' : currentOp === 'sub' ? '没収' : '設定';
    document.getElementById('xp-execute-btn').textContent = `実行する（${label}）`;
  });
});

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await loadXPList();
}

async function loadXPList() {
  const res = await fetch(`${API}/users/xp-ranking`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return;
  const data = await res.json();

  // セレクトボックスにユーザー追加
  const sel = document.getElementById('xp-target-user');
  // 既存オプション（全ユーザー以外）をクリア
  while (sel.options.length > 1) sel.remove(1);
  data.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.username;
    opt.textContent = `${u.username}（Lv.${u.level} / ${u.xp} XP）`;
    sel.appendChild(opt);
  });

  // テーブル描画
  const tbody = document.getElementById('xp-list');
  tbody.innerHTML = '';
  data.forEach((u, i) => {
    const rank = i + 1;
    const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}位`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="順位" style="font-weight:700;font-size:15px;">${rankLabel}</td>
      <td data-label="ユーザー"><b>${u.username}</b></td>
      <td data-label="Lv"><span style="color:var(--accent-2);font-weight:700;">Lv.${u.level}</span></td>
      <td data-label="XP"><span style="color:var(--text);font-weight:600;">${u.xp.toLocaleString()} XP</span></td>
      <td data-label="連続ログイン">🔥 ${u.streak}日</td>
      <td data-label="クイック操作">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn-primary quick-add" data-user="${u.username}" 
            style="padding:4px 10px;font-size:12px;">+100</button>
          <button class="btn-secondary quick-sub" data-user="${u.username}"
            style="padding:4px 10px;font-size:12px;">-100</button>
          <button class="btn-danger quick-reset" data-user="${u.username}"
            style="padding:4px 10px;font-size:12px;">0にする</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // クイック操作
  document.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', () => executeXP(btn.dataset.user, 'add', 100, 'クイック配布'));
  });
  document.querySelectorAll('.quick-sub').forEach(btn => {
    btn.addEventListener('click', () => executeXP(btn.dataset.user, 'sub', 100, 'クイック没収'));
  });
  document.querySelectorAll('.quick-reset').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`${btn.dataset.user} のXPを0にしますか？`)) return;
      await executeXP(btn.dataset.user, 'set', 0, 'XPリセット');
    });
  });
}

async function executeXP(username, operation, amount, reason) {
  const msg = document.getElementById('xp-admin-msg');
  msg.style.color = 'var(--text-2)';
  msg.textContent = '処理中...';

  const res = await fetch(`${API}/users/xp-manage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, operation, amount, reason })
  });

  const data = await res.json();

  if (res.ok) {
    msg.style.color = 'var(--green)';
    const updated = data.updated;
    if (updated.length === 1) {
      msg.textContent = `✓ ${updated[0].username}：${updated[0].old_xp} → ${updated[0].new_xp} XP（Lv.${updated[0].level}）`;
    } else {
      msg.textContent = `✓ ${updated.length}人のXPを更新しました`;
    }
    await loadXPList();
  } else {
    msg.style.color = 'var(--red)';
    msg.textContent = data.detail || 'エラーが発生しました';
  }
}

document.getElementById('xp-execute-btn').addEventListener('click', async () => {
  const username = document.getElementById('xp-target-user').value;
  const amount = parseInt(document.getElementById('xp-amount').value) || 0;
  const reason = document.getElementById('xp-reason').value.trim();

  if (amount < 0) {
    document.getElementById('xp-admin-msg').textContent = 'XP量は0以上で入力してください';
    return;
  }

  const targetLabel = username === '__all__' ? '全ユーザー' : username;
  const opLabel = currentOp === 'add' ? `+${amount}XP配布` : currentOp === 'sub' ? `-${amount}XP没収` : `${amount}XPに設定`;

  if (!confirm(`${targetLabel} に ${opLabel} します。よろしいですか？`)) return;

  await executeXP(username, currentOp, amount, reason);
});

init();
