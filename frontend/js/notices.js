let editingId = null;

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  load();
}

async function load() {
  const notices = await api('/notices/all').catch(() => []);
  const tbody   = document.getElementById('notice-list');
  tbody.innerHTML = '';
  if (!notices.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#7a87aa;">お知らせはありません</td></tr>';
    return;
  }
  notices.forEach(n => {
    const tr = document.createElement('tr');
    const PRIORITY_BADGE = { urgent:'<span style="color:var(--red);font-weight:700;">🚨緊急</span>', important:'<span style="color:#f5a623;font-weight:700;">⚠️重要</span>', normal:'' };
    tr.innerHTML = `
      <td>${n.id}</td>
      <td>${n.is_pinned?'📌 ':''}<strong>${n.title}</strong>${PRIORITY_BADGE[n.priority]||''}</td>
      <td><span class="badge ${n.is_active?'badge-active':'badge-inactive'}">${n.is_active?'公開中':'非公開'}</span></td>
      <td>${new Date(n.created_at).toLocaleDateString('ja-JP')}</td>
      <td style="display:flex;gap:8px;">
        <button class="btn-secondary edit-btn"
          data-id="${n.id}" data-title="${n.title}" data-content="${n.content}"
          data-active="${n.is_active}" data-pinned="${n.is_pinned||false}" data-priority="${n.priority||'normal'}">編集</button>
        <button class="btn-danger delete-btn" data-id="${n.id}">削除</button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.id;
      document.getElementById('modal-title').textContent    = 'お知らせ編集';
      document.getElementById('notice-title').value         = btn.dataset.title;
      document.getElementById('notice-content').value       = btn.dataset.content;
      document.getElementById('notice-pinned').checked      = btn.dataset.pinned === 'true';
      document.getElementById('notice-priority').value      = btn.dataset.priority || 'normal';
      document.getElementById('notice-active').checked      = btn.dataset.active === 'true';
      document.getElementById('modal').classList.remove('hidden');
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このお知らせを削除しますか？')) return;
      try { await api(`/notices/${btn.dataset.id}`, { method:'DELETE' }); load(); }
      catch(e) { toast(e.message||'削除に失敗しました','error'); }
    });
  });
}

document.getElementById('add-notice-btn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('modal-title').textContent   = 'お知らせ追加';
  document.getElementById('notice-title').value        = '';
  document.getElementById('notice-content').value      = '';
  document.getElementById('notice-pinned').checked     = false;
  document.getElementById('notice-priority').value     = 'normal';
  document.getElementById('notice-active').checked     = true;
  document.getElementById('modal').classList.remove('hidden');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('modal-submit').addEventListener('click', async () => {
  const title   = document.getElementById('notice-title').value.trim();
  const content = document.getElementById('notice-content').value.trim();
  if (!title || !content) { alert('タイトルと内容を入力してください'); return; }
  try {
    const is_pinned = document.getElementById('notice-pinned').checked;
    const priority  = document.getElementById('notice-priority').value;
    const is_active = document.getElementById('notice-active')?.checked ?? true;
    if (editingId) {
      await api(`/notices/${editingId}`, { method:'PATCH', body:JSON.stringify({ title, content, is_active, is_pinned, priority }) });
    } else {
      await api('/notices/', { method:'POST', body:JSON.stringify({ title, content, is_active:true, is_pinned, priority }) });
    }
    document.getElementById('modal').classList.add('hidden');
    toast(editingId ? '更新しました' : '追加しました', 'success');
    load();
  } catch(e) { toast(e.message||'保存に失敗しました','error'); }
});

init();
