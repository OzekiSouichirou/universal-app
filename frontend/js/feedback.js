document.getElementById('logout-btn').addEventListener('click', logout);

const TYPE_LABELS   = { idea:'💡 改善案', bug:'🐛 バグ報告', request:'🙏 機能リクエスト', other:'📝 その他' };
const STATUS_LABELS = { open:'未対応', in_progress:'対応中', done:'完了' };
const STATUS_COLORS = { open:'var(--text-3)', in_progress:'#f5a623', done:'var(--green)' };

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await loadMine();
}

document.getElementById('fb-content').addEventListener('input', () => {
  document.getElementById('fb-content-count').textContent = `${document.getElementById('fb-content').value.length} / 500`;
});

document.getElementById('fb-submit-btn').addEventListener('click', async () => {
  const type         = document.getElementById('fb-type').value;
  const title        = document.getElementById('fb-title').value.trim();
  const content      = document.getElementById('fb-content').value.trim();
  const is_anonymous = document.getElementById('fb-anonymous').checked;
  const msg          = document.getElementById('fb-msg');
  if (!title)   { msg.style.color='var(--red)'; msg.textContent='タイトルを入力してください'; return; }
  if (!content) { msg.style.color='var(--red)'; msg.textContent='内容を入力してください'; return; }
  try {
    await api('/feedback/', { method:'POST', body:JSON.stringify({ type, title, content, is_anonymous }) });
    msg.style.color = 'var(--green)'; msg.textContent = '送信しました！ありがとうございます。';
    document.getElementById('fb-title').value = '';
    document.getElementById('fb-content').value = '';
    document.getElementById('fb-content-count').textContent = '0 / 500';
    document.getElementById('fb-anonymous').checked = false;
    await loadMine();
  } catch(e) { msg.style.color='var(--red)'; msg.textContent=e.message||'送信に失敗しました'; }
});

async function loadMine() {
  const items = await api('/feedback/my').catch(() => []);
  const list  = document.getElementById('fb-mine-list');
  if (!items?.length) { list.innerHTML = '<p class="db-empty">まだ送信していません</p>'; return; }
  list.innerHTML = items.map(f => `
    <div class="fb-item">
      <div class="fb-item-header">
        <span class="fb-type-badge">${TYPE_LABELS[f.type]||f.type}</span>
        <span class="fb-status" style="color:${STATUS_COLORS[f.status]}">${STATUS_LABELS[f.status]}</span>
        <span class="fb-date">${new Date(f.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</span>
      </div>
      <div class="fb-item-title">${f.title}</div>
      <div class="fb-item-content">${f.content}</div>
      ${f.is_anonymous?'<div class="fb-anon-tag">匿名投稿</div>':''}
    </div>`).join('');
}

init();
