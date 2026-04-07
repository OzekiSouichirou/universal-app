document.getElementById('logout-btn').addEventListener('click', logout);

const PRIORITY_LABELS = { high:'🔴 高', medium:'🟡 中', low:'🟢 低' };
const STATUS_LABELS   = { pending:'未着手', in_progress:'進行中', done:'完了' };
const STATUS_COLORS   = { pending:'var(--text-3)', in_progress:'#f5a623', done:'var(--green)' };

let tasksData   = [];
let filterStatus = 'all';

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('task-due').value = today;
  await load();
}

async function load() {
  tasksData = await api('/tasks/').catch(() => []);
  renderList();
}

function renderList() {
  const el   = document.getElementById('tasks-list');
  const today = new Date().toISOString().slice(0,10);
  const items = filterStatus === 'all' ? tasksData : tasksData.filter(t => t.status === filterStatus);
  if (!items.length) { el.innerHTML = '<p class="db-empty">課題はありません</p>'; return; }

  el.innerHTML = items.map(t => {
    const overdue = t.due_date < today && t.status !== 'done';
    const daysLeft = Math.ceil((new Date(t.due_date) - new Date(today)) / 86400000);
    const daysLabel = t.status === 'done' ? '' :
      daysLeft < 0  ? `<span style="color:var(--red);font-weight:700;">${Math.abs(daysLeft)}日超過</span>` :
      daysLeft === 0 ? `<span style="color:var(--red);font-weight:700;">今日締切</span>` :
      daysLeft <= 3  ? `<span style="color:#f5a623;font-weight:700;">あと${daysLeft}日</span>` :
      `<span style="color:var(--text-3);">あと${daysLeft}日</span>`;
    return `
    <div class="task-item ${t.status} ${overdue?'overdue':''}" data-id="${t.id}">
      <div class="task-item-left">
        <button class="task-status-btn" data-id="${t.id}" data-status="${t.status}" title="ステータスを変更">
          ${t.status==='done'?'✅':t.status==='in_progress'?'🔄':'⬜'}
        </button>
        <div>
          <div class="task-title ${t.status==='done'?'done-text':''}">${t.title}</div>
          <div class="task-meta">
            ${t.subject?`<span>${t.subject}</span>・`:''}<span>${t.due_date}</span>・${daysLabel}
            ・<span>${PRIORITY_LABELS[t.priority]}</span>
            ${t.memo?`・<span style="color:var(--text-3)">${t.memo}</span>`:''}
          </div>
        </div>
      </div>
      <div class="task-item-right">
        <span class="task-status-label" style="color:${STATUS_COLORS[t.status]}">${STATUS_LABELS[t.status]}</span>
        <button class="task-edit-btn btn-secondary" data-id="${t.id}" style="padding:4px 10px;font-size:11px;">編集</button>
      </div>
    </div>`;
  }).join('');

  // ステータス変更ボタン
  document.querySelectorAll('.task-status-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const cur = btn.dataset.status;
      const next = cur === 'pending' ? 'in_progress' : cur === 'in_progress' ? 'done' : 'pending';
      try {
        await api(`/tasks/${id}/status`, { method:'PATCH', body:JSON.stringify({ status: next }) });
        await load();
      } catch(e) { toast(e.message||'更新に失敗しました', 'error'); }
    });
  });

  // 編集ボタン
  document.querySelectorAll('.task-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(parseInt(btn.dataset.id));
    });
  });
}

document.getElementById('task-add-btn').addEventListener('click', async () => {
  const title   = document.getElementById('task-title').value.trim();
  const subject = document.getElementById('task-subject').value.trim();
  const due     = document.getElementById('task-due').value;
  const priority= document.getElementById('task-priority').value;
  const memo    = document.getElementById('task-memo').value.trim();
  const msg     = document.getElementById('task-msg');
  if (!title) { msg.style.color='var(--red)'; msg.textContent='タイトルを入力してください'; return; }
  if (!due)   { msg.style.color='var(--red)'; msg.textContent='締切日を入力してください'; return; }
  try {
    await api('/tasks/', { method:'POST', body:JSON.stringify({ title, subject:subject||null, due_date:due, priority, memo:memo||null }) });
    // カレンダーにも自動登録
    if (document.getElementById('task-sync-cal')?.checked) {
      try {
        await api('/calendar/', { method:'POST', body:JSON.stringify({
          title: `【課題】${title}${subject?' ('+subject+')':''}`,
          date: due, type: 'deadline', memo: memo||null
        })});
      } catch(_) {}
    }
    msg.style.color='var(--green)'; msg.textContent='追加しました';
    document.getElementById('task-title').value   = '';
    document.getElementById('task-subject').value = '';
    document.getElementById('task-memo').value    = '';
    await load();
    setTimeout(() => { msg.textContent=''; }, 2000);
  } catch(e) { msg.style.color='var(--red)'; msg.textContent=e.message||'追加に失敗しました'; }
});

// フィルター
document.querySelectorAll('.task-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterStatus = btn.dataset.status;
    renderList();
  });
});

function openEditModal(id) {
  const t = tasksData.find(t => t.id === id);
  if (!t) return;
  document.getElementById('edit-task-id').value       = t.id;
  document.getElementById('edit-task-title').value    = t.title;
  document.getElementById('edit-task-subject').value  = t.subject || '';
  document.getElementById('edit-task-due').value      = t.due_date;
  document.getElementById('edit-task-priority').value = t.priority;
  document.getElementById('edit-task-memo').value     = t.memo || '';
  document.getElementById('task-edit-modal').classList.remove('hidden');
}

document.getElementById('edit-task-cancel-btn').addEventListener('click', () => {
  document.getElementById('task-edit-modal').classList.add('hidden');
});

document.getElementById('edit-task-save-btn').addEventListener('click', async () => {
  const id      = parseInt(document.getElementById('edit-task-id').value);
  const title   = document.getElementById('edit-task-title').value.trim();
  const subject = document.getElementById('edit-task-subject').value.trim();
  const due     = document.getElementById('edit-task-due').value;
  const priority= document.getElementById('edit-task-priority').value;
  const memo    = document.getElementById('edit-task-memo').value.trim();
  try {
    await api(`/tasks/${id}`, { method:'PATCH', body:JSON.stringify({ title, subject:subject||null, due_date:due, priority, memo:memo||null }) });
    document.getElementById('task-edit-modal').classList.add('hidden');
    await load();
  } catch(e) { toast(e.message||'更新に失敗しました', 'error'); }
});

document.getElementById('edit-task-delete-btn').addEventListener('click', async () => {
  if (!confirm('この課題を削除しますか？')) return;
  const id = parseInt(document.getElementById('edit-task-id').value);
  try {
    await api(`/tasks/${id}`, { method:'DELETE' });
    document.getElementById('task-edit-modal').classList.add('hidden');
    await load();
  } catch(e) { toast(e.message||'削除に失敗しました', 'error'); }
});

init();
