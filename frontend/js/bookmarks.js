document.getElementById('logout-btn').addEventListener('click', logout);

let avatars = {};

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  avatars = await api('/users/avatars').catch(() => ({}));
  await load();
}

async function load() {
  const items = await api('/bookmarks/').catch(() => []);
  const el = document.getElementById('bookmark-list');
  if (!items.length) {
    el.innerHTML = '<p class="db-empty" style="text-align:center;padding:40px;">ブックマークした投稿はありません<br><a href="board.html" style="color:var(--accent);">掲示板へ</a></p>';
    return;
  }
  el.innerHTML = items.map(b => {
    const av = avatars[b.username];
    const initial = b.username.charAt(0).toUpperCase();
    const avatarHtml = av
      ? `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`
      : `<div class="post-avatar">${initial}</div>`;
    return `
    <div class="post-card">
      <div class="post-header">
        <div class="post-user-info">
          ${avatarHtml}
          <span class="post-username">${b.username}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="post-date">${new Date(b.post_created_at+'Z').toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</span>
          <button class="bookmark-btn bookmarked" data-post-id="${b.post_id}" title="ブックマーク解除">🔖</button>
        </div>
      </div>
      <div class="post-content">${escapeHtml(b.content)}</div>
      ${b.image ? `<div class="post-image"><img src="${b.image}" alt="投稿画像" loading="lazy"></div>` : ''}
      <div style="font-size:11px;color:var(--text-3);margin-top:8px;">
        ブックマーク: ${new Date(b.created_at+'Z').toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('ブックマークを解除しますか？')) return;
      try {
        await api(`/bookmarks/${btn.dataset.postId}`, { method:'DELETE' });
        toast('ブックマークを解除しました');
        await load();
      } catch(e) { toast(e.message||'失敗しました', 'error'); }
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
