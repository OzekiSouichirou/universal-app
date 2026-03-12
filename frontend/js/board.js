const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let currentUser = null;

document.getElementById('logout-btn').addEventListener('click', logout);

const textarea = document.getElementById('post-content');
const charCount = document.getElementById('char-count');

textarea.addEventListener('input', () => {
  charCount.textContent = `${textarea.value.length} / 500`;
});

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;
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
        <span class="post-username">${p.username}</span>
        <span class="post-date">${new Date(p.created_at + 'Z').toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      <div class="post-footer">
        <button class="like-btn ${p.liked ? 'liked' : ''}" data-id="${p.id}">
          ♥ <span class="like-count">${p.likes}</span>
        </button>
        ${p.username === currentUser.username || currentUser.role === 'admin' ? `
          <button class="delete-post-btn" data-id="${p.id}">削除</button>
        ` : ''}
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