let _bmAvatars = {};

// board.htmlと共存するためlogout-btnの重複登録を防ぐ
if (!document.getElementById('post-content')) {
  document.getElementById('logout-btn').addEventListener('click', logout);
}

async function bmInit() {
  const user = await checkAuth(false);
  if (!user) return;
  const el = document.getElementById('current-user');
  if (el) el.textContent = user.username;
  _bmAvatars = await api('/users/avatars').catch(() => ({}));
  await bmLoad();
}

async function bmLoad() {
  const items = await api('/bookmarks/').catch(() => []);
  const el    = document.getElementById('bookmark-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<p class="db-empty" style="text-align:center;padding:40px;">ブックマークした投稿はありません<br><a href="board.html" style="color:var(--accent);">掲示板へ</a></p>';
    return;
  }
  el.innerHTML = items.map(b => {
    const av      = _bmAvatars[b.username];
    const initial = b.username.charAt(0).toUpperCase();
    const avHtml  = av
      ? `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`
      : `<div class="post-avatar">${initial}</div>`;
    return `<div class="post-card">
      <div class="post-header">
        <div class="post-user-info">
          ${avHtml}
          <span class="post-username">${b.username}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${b.tag ? `<span class="post-tag-badge">${b.tag}</span>` : ''}
          <span class="post-date">${new Date(b.post_created_at + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
          <button class="bookmark-btn bookmarked" data-post-id="${b.post_id}" title="ブックマーク解除">🔖</button>
        </div>
      </div>
      <div class="post-content">${bmEscapeHtml(b.content)}</div>
      ${b.image ? `<div class="post-image"><img src="${b.image}" alt="投稿画像" loading="lazy"></div>` : ''}
      <div style="font-size:11px;color:var(--text-3);margin-top:8px;">
        ブックマーク: ${new Date(b.created_at + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('ブックマークを解除しますか？')) return;
      try {
        await api(`/bookmarks/${btn.dataset.postId}`, { method: 'DELETE' });
        toast('ブックマークを解除しました');
        await bmLoad();
      } catch(e) { toast(e.message || '失敗しました', 'error'); }
    });
  });
}

function bmEscapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

// board.htmlでは呼ばれない（tab切り替え時にbmInitを呼ぶ）
if (!document.getElementById('tab-bookmarks')) bmInit();
