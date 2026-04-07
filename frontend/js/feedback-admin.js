document.getElementById('logout-btn').addEventListener('click', logout);

const TYPE_LABELS   = { idea:'改善案', bug:'バグ報告', request:'機能リクエスト', other:'その他' };
const STATUS_LABELS = { open:'未対応', in_progress:'対応中', done:'完了' };
const STATUS_COLORS = { open:'var(--text-3)', in_progress:'#f5a623', done:'var(--green)' };
let allItems     = [];
let currentFilter = 'all';

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await loadAll();
}

async function loadAll() {
  allItems = await api('/feedback/all').catch(() => []);
  render();
}

function render() {
  const list     = document.getElementById('fb-admin-list');
  const filtered = currentFilter==='all' ? allItems : allItems.filter(f => f.status===currentFilter);
  if (!filtered.length) { list.innerHTML='<p class="db-empty">該当するご意見はありません</p>'; return; }
  list.innerHTML = filtered.map(f => `
    <div class="fb-item" data-id="${f.id}">
      <div class="fb-item-header">
        <span class="fb-type-badge">${TYPE_LABELS[f.type]||f.type}</span>
        <span class="fb-username">👤 ${f.username}</span>
        <span class="fb-date">${new Date(f.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</span>
        <span class="fb-status" style="color:${STATUS_COLORS[f.status]}">${STATUS_LABELS[f.status]}</span>
      </div>
      <div class="fb-item-title">${f.title}</div>
      <div class="fb-item-content">${f.content}</div>
      <div class="fb-admin-actions">
        <select class="fb-status-select" data-id="${f.id}">
          <option value="open"        ${f.status==='open'       ?'selected':''}>未対応</option>
          <option value="in_progress" ${f.status==='in_progress'?'selected':''}>対応中</option>
          <option value="done"        ${f.status==='done'       ?'selected':''}>完了</option>
        </select>
        <button class="btn-danger fb-delete-btn" data-id="${f.id}">削除</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.fb-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = parseInt(sel.dataset.id);
      try {
        await api(`/feedback/${id}/status`, { method:'PATCH', body:JSON.stringify({ status:sel.value }) });
        const item = allItems.find(f => f.id===id);
        if (item) { item.status = sel.value; }
        sel.closest('.fb-item').querySelector('.fb-status').textContent = STATUS_LABELS[sel.value];
        sel.closest('.fb-item').querySelector('.fb-status').style.color = STATUS_COLORS[sel.value];
      } catch(e) { toast(e?.message||'操作に失敗しました', 'error'); }
    });
  });

  list.querySelectorAll('.fb-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('このご意見を削除しますか？')) return;
      const id = parseInt(btn.dataset.id);
      try {
        await api(`/feedback/${id}`, { method:'DELETE' });
        allItems = allItems.filter(f => f.id!==id);
        render();
      } catch(e) { toast(e?.message||'操作に失敗しました', 'error'); }
    });
  });
}

document.querySelectorAll('.fb-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fb-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.status;
    render();
  });
});

init();
