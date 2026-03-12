const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let currentUser = null;
let avatars = {};

document.getElementById('logout-btn').addEventListener('click', logout);

const textarea = document.getElementById('post-content');
const charCount = document.getElementById('char-count');

textarea.addEventListener('input', () => {
  charCount.textContent = `${textarea.value.length} / 500`;
});

function avatarHtml(username) {
  const av = avatars[username];
  const initial = username.charAt(0).toUpperCase();
  if (av) {
    return `<div class="post-avatar"><img src="${av}" alt="${initial}"></div>`;
  }
  return `<div class="post-avatar">${initial}</div>`;
}

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;
  const avRes = await fetch(`${API}/users/avatars`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  avatars = await avRes.json();
  fetchPosts();
}

async function fetchPosts() {
  const res = await fetch(`${API}/posts/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const posts = Array.isArray(data) ? data : [];
  renderPosts(posts);
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
          <span class="post-username">${p.username}</span>
        </div>
        <span class="post-date">${new Date(p.created_at + 'Z').toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
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
      const res = await fetch(`${API}/posts/${id}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      btn.querySelector('.like-count').textContent = data.likes;
      btn.classList.toggle('liked', data.liked);
    });
  });

  document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const area = document.getElementById(`comments-${id}`);
      const isHidden = area.classList.contains('hidden');
      area.classList.toggle('hidden');
      if (isHidden) {
        await fetchComments(id);
      }
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
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        input.value = '';
        await fetchComments(id);
        const countEl = document.querySelector(`.comment-toggle-btn[data-id="${id}"] .comment-count`);
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
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
      if (res.ok) {
        document.getElementById(`post-${id}`).remove();
      }
    });
  });
}

async function fetchComments(postId) {
  const res = await fetch(`${API}/posts/${postId}/comments`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const comments = await res.json();
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

  document.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.id;
      const pid = btn.dataset.postId;
      const res = await fetch(`${API}/posts/${pid}/comments/${cid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        document.getElementById(`comment-${cid}`).remove();
        const countEl = document.querySelector(`.comment-toggle-btn[data-id="${pid}"] .comment-count`);
        if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
    });
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
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
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  if (res.ok) {
    textarea.value = '';
    charCount.textContent = '0 / 500';
    msg.textContent = '';
    fetchPosts();
  } else {
    const data = await res.json();
    msg.style.color = '#f0476c';
    msg.textContent = data.detail;
  }
});

init();
