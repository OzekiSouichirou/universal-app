let currentUser = null;
let avatars = {};
let selectedImage = null;
let bookmarks = new Set();
let bookmarks = new Set();

document.getElementById('logout-btn').addEventListener('click', logout);

const TAGS = ['数学','英語','物理','化学','生物','歴史','国語','情報','体育','その他'];

const textarea  = document.getElementById('post-content');
const charCount = document.getElementById('char-count');
textarea.addEventListener('input', () => { charCount.textContent = `${textarea.value.length} / 500`; });

function avatarHtml(username) {
  const av      = avatars[username];
  const initial = username.charAt(0).toUpperCase();
  return av
    ? `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`
    : `<div class="post-avatar">${initial}</div>`;
}

async function compress(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const img    = new Image();
    const url    = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else       { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.60));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

document.getElementById('image-attach-btn').addEventListener('click', () => {
  document.getElementById('image-input').click();
});

document.getElementById('image-input').addEventListener('change', async (e) => {
  const file    = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('image-preview');
  const msg     = document.getElementById('post-msg');

  if (!file.type.startsWith('image/')) {
    msg.style.color = '#f0476c'; msg.textContent = '画像ファイルを選択してください'; return;
  }
  if (file.size > 10 * 1024 * 1024) {
    msg.style.color = '#f0476c'; msg.textContent = '10MB以下の画像を選択してください'; return;
  }

  msg.style.color = '#7a87aa'; msg.textContent = '圧縮中...';

  try {
    const dataUrl = await compress(file);
    if (dataUrl.length > 800 * 1024) {
      msg.style.color = '#f0476c'; msg.textContent = '画像が大きすぎます。小さい画像を使用してください';
      selectedImage = null; preview.innerHTML = ''; return;
    }
    selectedImage = dataUrl;
    preview.innerHTML = `
      <div class="image-preview-wrap">
        <img src="${dataUrl}" alt="preview">
        <button class="image-remove-btn" id="image-remove-btn">✕</button>
      </div>`;
    document.getElementById('image-remove-btn').addEventListener('click', () => {
      selectedImage = null; preview.innerHTML = ''; msg.textContent = '';
    });
    msg.textContent = '';
  } catch {
    msg.style.color = '#f0476c'; msg.textContent = '画像の処理に失敗しました';
  }
  e.target.value = '';
});

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;
  avatars = await api('/users/avatars').catch(() => ({}));
  const bm = await api('/bookmarks/').catch(() => []);
  bookmarks = new Set((Array.isArray(bm) ? bm : []).map(b => b.post_id));
  fetchPosts();
  fetchNotifs();
}

async function fetchNotifs() {
  const notifs = await api('/posts/notifications/list').catch(() => []);
  const unread = notifs.filter(n => !n.is_read).length;
  const badge  = document.getElementById('notif-badge');
  badge.textContent    = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
  badge.style.display  = unread > 0 ? 'flex' : 'none';
  renderNotifs(notifs);
}

function renderNotifs(notifs) {
  const list = document.getElementById('notif-list');
  if (!notifs.length) { list.innerHTML = '<p class="notif-empty">通知はありません</p>'; return; }
  list.innerHTML = notifs.map(n => {
    const label = n.type === 'like' ? '♥ いいね' : '💬 コメント';
    const time  = new Date(n.created_at + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    return `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-post-id="${n.post_id}">
        <span class="notif-type ${n.type}">${label}</span>
        <span class="notif-text"><b>${n.from_username}</b>さんが投稿に${n.type === 'like' ? 'いいね' : 'コメント'}しました</span>
        <span class="notif-time">${time}</span>
      </div>`;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = document.getElementById(`post-${item.dataset.postId}`);
      closeNotifPanel();
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.outline = '2px solid var(--accent)';
        setTimeout(() => target.style.outline = '', 2000);
      }
    });
  });
}

function closeNotifPanel() {
  document.getElementById('notif-panel').classList.add('hidden');
}

document.getElementById('notif-bell').addEventListener('click', async () => {
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    await api('/posts/notifications/read-all', { method: 'POST' }).catch(() => {});
    document.getElementById('notif-badge').style.display = 'none';
    document.getElementById('notif-badge').textContent = '';
    document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
  }
});

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const bell  = document.getElementById('notif-bell');
  if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !bell.contains(e.target)) {
    closeNotifPanel();
  }
});

let _searchQuery = '';
let _searchTimer = null;

async function fetchPosts(q = '') {
  avatars = await api('/users/avatars').catch(() => ({}));
  const path = q.trim() ? `/posts/?q=${encodeURIComponent(q.trim())}` : '/posts/';
  const posts = await api(path).catch(() => []);
  renderPosts(Array.isArray(posts) ? posts : []);
  const status = document.getElementById('search-status');
  if (status) status.textContent = q.trim() ? `「${q.trim()}」の検索結果: ${posts?.length ?? 0}件` : '';
}

function initSearch() {
  const input    = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!input) return;
  input.addEventListener('input', () => {
    _searchQuery = input.value;
    clearBtn.style.display = _searchQuery ? 'block' : 'none';
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => fetchPosts(_searchQuery), 400);
  });
  clearBtn.addEventListener('click', () => {
    input.value = ''; _searchQuery = ''; clearBtn.style.display = 'none'; fetchPosts();
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function renderPosts(posts) {
  const list = document.getElementById('post-list');
  if (!posts.length) { list.innerHTML = '<p class="no-posts">まだ投稿はありません</p>'; return; }

  const RARITY_COLORS = { SECR:'#b06ef5', UR:'#f08cff', SSR:'#f5a623', SR:'#41b4f5', R:'#3ecf8e', N:'#8892b0' };
  const RARITY_ORDER  = ['SECR','UR','SSR','SR','R','N'];

  list.innerHTML = posts.map(p => {
    const titleBadge = (p.title_a || p.title_b) ? (() => {
      const top   = [p.rarity_a, p.rarity_b].filter(Boolean).sort((a,b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b))[0] || 'N';
      const color = RARITY_COLORS[top] || '#8892b0';
      const title = [p.title_a, p.title_b].filter(Boolean).join(' ');
      return `<span class="post-title-badge" style="color:${color};font-size:11px;margin-left:4px;opacity:0.9;">『${title}』</span>`;
    })() : '';
    return `
      <div class="post-card" id="post-${p.id}">
        <div class="post-header">
          <div class="post-user-info">
            ${avatarHtml(p.username)}
            <div class="post-user-meta">
              <span class="post-username"${p.username === currentUser.username ? ' style="color:var(--accent-2)"' : ''}>${p.username}</span>
              ${titleBadge}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${p.tag ? `<span class="post-tag-badge">${p.tag}</span>` : ''}
            <span class="post-date">${new Date(p.created_at + 'Z').toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})}</span>
          </div>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        ${p.image ? `<div class="post-image"><img src="${p.image}" alt="投稿画像" loading="lazy"></div>` : ''}
        <div class="post-footer">
          <button class="like-btn ${p.liked ? 'liked' : ''}" data-id="${p.id}">♥ <span class="like-count">${p.likes}</span></button>
          <button class="bookmark-btn ${bookmarks.has(p.id) ? 'bookmarked' : ''}" data-id="${p.id}" title="ブックマーク">🔖</button>
          <button class="comment-toggle-btn" data-id="${p.id}">💬 <span class="comment-count">${p.comment_count}</span></button>
          <button class="bookmark-btn ${bookmarks.has(p.id) ? 'bookmarked' : ''}" data-id="${p.id}" title="ブックマーク">🔖</button>
          ${p.username === currentUser.username || currentUser.role === 'admin' ? `<button class="delete-post-btn" data-id="${p.id}">削除</button>` : ''}
        </div>
        <div class="comment-area hidden" id="comments-${p.id}">
          <div class="comment-list" id="comment-list-${p.id}"></div>
          <div class="comment-form">
            <input type="text" class="comment-input" id="comment-input-${p.id}" placeholder="コメントを入力（200文字以内）" maxlength="200">
            <button class="comment-submit-btn btn-primary" data-id="${p.id}">送信</button>
          </div>
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api(`/posts/${btn.dataset.id}/like`, { method: 'POST' });
        btn.querySelector('.like-count').textContent = data.likes ?? 0;
        btn.classList.toggle('liked', !!data.liked);
      } catch(e) { console.warn('like error:', e); }
    });
  });

  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      try {
        if (bookmarks.has(id)) {
          await api(`/bookmarks/${id}`, { method: 'DELETE' });
          bookmarks.delete(id);
          btn.classList.remove('bookmarked');
          toast('ブックマークを解除しました');
        } else {
          await api(`/bookmarks/${id}`, { method: 'POST' });
          bookmarks.add(id);
          btn.classList.add('bookmarked');
          toast('ブックマークしました', 'success');
        }
      } catch(e) { toast(e.message||'失敗しました', 'error'); }
    });
  });

  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      try {
        if (bookmarks.has(id)) {
          await api(`/bookmarks/${id}`, { method:'DELETE' });
          bookmarks.delete(id); btn.classList.remove('bookmarked');
          toast('ブックマークを解除しました');
        } else {
          await api(`/bookmarks/${id}`, { method:'POST' });
          bookmarks.add(id); btn.classList.add('bookmarked');
          toast('ブックマークしました', 'success');
        }
      } catch(e) { toast(e.message||'失敗しました','error'); }
    });
  });

  document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const area = document.getElementById(`comments-${btn.dataset.id}`);
      area.classList.toggle('hidden');
      if (!area.classList.contains('hidden')) await fetchComments(btn.dataset.id);
    });
  });

  document.querySelectorAll('.comment-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.id;
      const input = document.getElementById(`comment-input-${id}`);
      const content = input.value.trim();
      if (!content) return;
      try {
        await api(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
        input.value = '';
        await fetchComments(id);
        const el = document.querySelector(`.comment-toggle-btn[data-id="${id}"] .comment-count`);
        if (el) el.textContent = parseInt(el.textContent) + 1;
      } catch(e) { console.warn('comment error:', e); }
    });
  });

  document.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この投稿を削除しますか？')) return;
      try {
        await api(`/posts/${btn.dataset.id}`, { method: 'DELETE' });
        document.getElementById(`post-${btn.dataset.id}`).remove();
      } catch(e) { console.warn('delete error:', e); }
    });
  });
}

async function fetchComments(postId) {
  const comments = await api(`/posts/${postId}/comments`).catch(() => []);
  const list     = document.getElementById(`comment-list-${postId}`);
  if (!comments.length) { list.innerHTML = '<p class="no-comments">まだコメントはありません</p>'; return; }
  list.innerHTML = comments.map(c => `
    <div class="comment-item" id="comment-${c.id}">
      <div class="comment-header">
        ${avatarHtml(c.username)}
        <span class="comment-username">${c.username}</span>
        <span class="comment-date">${new Date(c.created_at + 'Z').toLocaleString('ja-JP', {timeZone:'Asia/Tokyo'})}</span>
        ${c.username === currentUser.username || currentUser.role === 'admin' ? `<button class="delete-comment-btn" data-post-id="${postId}" data-id="${c.id}">削除</button>` : ''}
      </div>
      <div class="comment-content">${escapeHtml(c.content)}</div>
    </div>`).join('');

  list.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/posts/${btn.dataset.postId}/comments/${btn.dataset.id}`, { method: 'DELETE' });
        document.getElementById(`comment-${btn.dataset.id}`).remove();
        const el = document.querySelector(`.comment-toggle-btn[data-id="${btn.dataset.postId}"] .comment-count`);
        if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
      } catch(e) { console.warn('delete comment error:', e); }
    });
  });
}

document.getElementById('post-btn').addEventListener('click', async () => {
  const content = textarea.value.trim();
  const msg     = document.getElementById('post-msg');
  if (!content) { msg.style.color = '#f0476c'; msg.textContent = '内容を入力してください'; return; }
  try {
    const tag = document.getElementById('post-tag-select')?.value || null;
    await api('/posts/', { method: 'POST', body: JSON.stringify({ content, image: selectedImage, tag }) });
    textarea.value = ''; charCount.textContent = '0 / 500';
    selectedImage = null; document.getElementById('image-preview').innerHTML = ''; msg.textContent = '';
    fetchPosts();
  } catch(e) {
    msg.style.color = '#f0476c';
    msg.textContent = e.message || '投稿に失敗しました';
  }
});

init();
initSearch();
