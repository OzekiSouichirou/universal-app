if (typeof parseResponse === 'undefined') {
  window.parseResponse = function(json, fb) {
    if (json && json.success === true) return json.data;
    if (json && json.success === false) return fb;
    return json != null ? json : fb;
  };
}
const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let currentUser = null;
let avatars = {};
let selectedImage = null;

document.getElementById('logout-btn').addEventListener('click', logout);

const textarea = document.getElementById('post-content');
const charCount = document.getElementById('char-count');

textarea.addEventListener('input', () => {
  charCount.textContent = `${textarea.value.length} / 500`;
});

function avatarHtml(username) {
  const av = avatars[username];
  const initial = username.charAt(0).toUpperCase();
  if (av) return `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`;
  return `<div class="post-avatar">${initial}</div>`;
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w;
      canvas.height = h;
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
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById('image-preview');
  const msg = document.getElementById('post-msg');

  if (!file.type.startsWith('image/')) {
    msg.style.color = '#f0476c';
    msg.textContent = '画像ファイルを選択してください';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    msg.style.color = '#f0476c';
    msg.textContent = '10MB以下の画像を選択してください';
    return;
  }

  msg.style.color = '#7a87aa';
  msg.textContent = '圧縮中...';

  try {
    const dataUrl = await compressImage(file);
    if (dataUrl.length > 800 * 1024) {
      msg.style.color = '#f0476c';
      msg.textContent = '画像が大きすぎます。小さい画像を使用してください';
      selectedImage = null;
      preview.innerHTML = '';
      return;
    }
    selectedImage = dataUrl;
    preview.innerHTML = `
      <div class="image-preview-wrap">
        <img src="${dataUrl}" alt="preview">
        <button class="image-remove-btn" id="image-remove-btn">✕</button>
      </div>`;
    document.getElementById('image-remove-btn').addEventListener('click', () => {
      selectedImage = null;
      preview.innerHTML = '';
      msg.textContent = '';
    });
    msg.textContent = '';
  } catch {
    msg.style.color = '#f0476c';
    msg.textContent = '画像の処理に失敗しました';
  }
  e.target.value = '';
});

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;
  const avRes = await fetch(`${API}/users/avatars`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const _raw1 = await avRes.json();
  avatars = parseResponse(_raw1, []);
  fetchPosts();
  fetchNotifications();
}

async function fetchNotifications() {
  const res = await fetch(`${API}/posts/notifications/list`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return;
  const nJson = await res.json();
  const notifs = (nJson && nJson.success === true) ? nJson.data : nJson;
  const unread = notifs.filter(n => !n.is_read).length;
  const badge = document.getElementById('notif-badge');
  const bell = document.getElementById('notif-bell');
  badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
  badge.style.display = unread > 0 ? 'flex' : 'none';
  renderNotifications(notifs);
}

function renderNotifications(notifs) {
  const list = document.getElementById('notif-list');
  if (notifs.length === 0) {
    list.innerHTML = '<p class="notif-empty">通知はありません</p>';
    return;
  }
  list.innerHTML = notifs.map(n => {
    const label = n.type === 'like' ? '♥ いいね' : '💬 コメント';
    const time = new Date(n.created_at + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    return `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-post-id="${n.post_id}">
        <span class="notif-type ${n.type}">${label}</span>
        <span class="notif-text"><b>${n.from_username}</b>さんが投稿に${n.type === 'like' ? 'いいね' : 'コメント'}しました</span>
        <span class="notif-time">${time}</span>
      </div>`;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const pid = item.dataset.postId;
      const target = document.getElementById(`post-${pid}`);
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
    await fetch(`${API}/posts/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    document.getElementById('notif-badge').style.display = 'none';
    document.getElementById('notif-badge').textContent = '';
    document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
  }
});

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const bell = document.getElementById('notif-bell');
  if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !bell.contains(e.target)) {
    closeNotifPanel();
  }
});

let _searchQuery = '';
let _searchTimer = null;

async function fetchPosts(q = '') {
  const url = q.trim() ? `${API}/posts/?q=${encodeURIComponent(q.trim())}` : `${API}/posts/`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const raw = await res.json();
  const data = parseResponse(raw, []);
  renderPosts(Array.isArray(data) ? data : []);

  const status = document.getElementById('search-status');
  if (status) {
    if (q.trim()) {
      status.textContent = `「${q.trim()}」の検索結果: ${Array.isArray(data) ? data.length : 0}件`;
    } else {
      status.textContent = '';
    }
  }
}

function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!input) return;

  input.addEventListener('input', () => {
    _searchQuery = input.value;
    clearBtn.style.display = _searchQuery ? 'block' : 'none';
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => fetchPosts(_searchQuery), 400);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    _searchQuery = '';
    clearBtn.style.display = 'none';
    fetchPosts();
  });
}

function renderPosts(posts) {
  const list = document.getElementById('post-list');
  if (posts.length === 0) {
    list.innerHTML = '<p class="no-posts">まだ投稿はありません</p>';
    return;
  }

  list.innerHTML = posts.map(p => `
    <div class="post-card" id="post-${p.id}">
      <div class="post-header">
        <div class="post-user-info">
          ${avatarHtml(p.username)}
          <div class="post-user-meta">
            <span class="post-username"${p.username === currentUser.username ? ' style="color:var(--accent-2)"' : ''}>${p.username}</span>
            ${(p.title_a || p.title_b) ? (() => {
              const RARITY_COLORS = {SECR:'#b06ef5',UR:'#f08cff',SSR:'#f5a623',SR:'#41b4f5',R:'#3ecf8e',N:'#8892b0'};
              const RARITY_ORDER = ['SECR','UR','SSR','SR','R','N'];
              // A・Bのうち高レアリティ色を使用
              const rarities = [p.rarity_a, p.rarity_b].filter(Boolean);
              const topRarity = rarities.sort((a,b)=>RARITY_ORDER.indexOf(a)-RARITY_ORDER.indexOf(b))[0] || 'N';
              const color = RARITY_COLORS[topRarity] || '#8892b0';
              const title = [p.title_a, p.title_b].filter(Boolean).join(' ');
              return `<span class="post-title-badge" style="color:${color};font-size:11px;margin-left:4px;opacity:0.9;">『${title}』</span>`;
            })() : ''}
          </div>
        </div>
        <span class="post-date">${new Date(p.created_at + 'Z').toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      ${p.image ? `<div class="post-image"><img src="${p.image}" alt="投稿画像" loading="lazy"></div>` : ''}
      <div class="post-footer">
        <button class="like-btn ${p.liked ? 'liked' : ''}" data-id="${p.id}">
          ♥ <span class="like-count">${p.likes}</span>
        </button>
        <button class="comment-toggle-btn" data-id="${p.id}">
          💬 <span class="comment-count">${p.comment_count}</span>
        </button>
        ${p.username === currentUser.username || currentUser.role === 'admin' ? `
          <button class="delete-post-btn" data-id="${p.id}">削除</button>
        ` : ''}
      </div>
      <div class="comment-area hidden" id="comments-${p.id}">
        <div class="comment-list" id="comment-list-${p.id}"></div>
        <div class="comment-form">
          <input type="text" class="comment-input" id="comment-input-${p.id}" placeholder="コメントを入力（200文字以内）" maxlength="200">
          <button class="comment-submit-btn btn-primary" data-id="${p.id}">送信</button>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        const res = await fetch(`${API}/posts/${id}/like`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const raw = await res.json();
        const data = parseResponse(raw, {});
        btn.querySelector('.like-count').textContent = data.likes ?? 0;
        btn.classList.toggle('liked', !!data.liked);
      } catch(e) { console.warn('like error:', e); }
    });
  });

  document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const area = document.getElementById(`comments-${id}`);
      area.classList.toggle('hidden');
      if (!area.classList.contains('hidden')) await fetchComments(id);
    });
  });

  document.querySelectorAll('.comment-submit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const input = document.getElementById(`comment-input-${id}`);
      const content = input.value.trim();
      if (!content) return;
      const res = await fetch(`${API}/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        input.value = '';
        await fetchComments(id);
        const el = document.querySelector(`.comment-toggle-btn[data-id="${id}"] .comment-count`);
        if (el) el.textContent = parseInt(el.textContent) + 1;
      }
    });
  });

  document.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この投稿を削除しますか？')) return;
      const id = btn.dataset.id;
      const res = await fetch(`${API}/posts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) document.getElementById(`post-${id}`).remove();
    });
  });
}

async function fetchComments(postId) {
  const res = await fetch(`${API}/posts/${postId}/comments`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const cJson = await res.json();
  const comments = (cJson && cJson.success === true) ? cJson.data : (Array.isArray(cJson) ? cJson : []);
  const list = document.getElementById(`comment-list-${postId}`);
  if (comments.length === 0) {
    list.innerHTML = '<p class="no-comments">まだコメントはありません</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item" id="comment-${c.id}">
      <div class="comment-header">
        ${avatarHtml(c.username)}
        <span class="comment-username">${c.username}</span>
        <span class="comment-date">${new Date(c.created_at + 'Z').toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}</span>
        ${c.username === currentUser.username || currentUser.role === 'admin' ? `
          <button class="delete-comment-btn" data-post-id="${postId}" data-id="${c.id}">削除</button>
        ` : ''}
      </div>
      <div class="comment-content">${escapeHtml(c.content)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.id, pid = btn.dataset.postId;
      const res = await fetch(`${API}/posts/${pid}/comments/${cid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        document.getElementById(`comment-${cid}`).remove();
        const el = document.querySelector(`.comment-toggle-btn[data-id="${pid}"] .comment-count`);
        if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
      }
    });
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

document.getElementById('post-btn').addEventListener('click', async () => {
  const content = textarea.value.trim();
  const msg = document.getElementById('post-msg');
  if (!content) {
    msg.style.color = '#f0476c';
    msg.textContent = '内容を入力してください';
    return;
  }
  const res = await fetch(`${API}/posts/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, image: selectedImage })
  });
  if (res.ok) {
    textarea.value = '';
    charCount.textContent = '0 / 500';
    selectedImage = null;
    document.getElementById('image-preview').innerHTML = '';
    msg.textContent = '';
    fetchPosts();
  } else {
    const _raw3 = await res.json();
    const data = parseResponse(_raw3, {});
    msg.style.color = '#f0476c';
    msg.textContent = data.detail;
  }
});

init();
