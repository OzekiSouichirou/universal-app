const token = localStorage.getItem('access_token');
let editingId = null;

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  fetchNotices();
}

async function fetchNotices() {
  const res = await fetch(`${API}/notices/all`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const notices = await res.json();
  const tbody = document.getElementById('notice-list');
  tbody.innerHTML = '';

  if (notices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#7a87aa;">お知らせはありません</td></tr>';
    return;
  }

  notices.forEach(n => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${n.id}</td>
      <td>${n.title}</td>
      <td><span class="badge ${n.is_active ? 'badge-active' : 'badge-inactive'}">${n.is_active ? '公開中' : '非公開'}</span></td>
      <td>${new Date(n.created_at).toLocaleDateString('ja-JP')}</td>
      <td style="display:flex;gap:8px;">
        <button class="btn-secondary edit-btn" data-id="${n.id}" data-title="${n.title}" data-content="${n.content}" data-active="${n.is_active}">編集</button>
        <button class="btn-danger delete-btn" data-id="${n.id}">削除</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      editingId = e.target.dataset.id;
      document.getElementById('modal-title').textContent = 'お知らせ編集';
      document.getElementById('notice-title').value = e.target.dataset.title;
      document.getElementById('notice-content').value = e.target.dataset.content;
      document.getElementById('modal').classList.remove('hidden');
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (!confirm('このお知らせを削除しますか？')) return;
      const res = await fetch(`${API}/notices/${e.target.dataset.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchNotices();
    });
  });
}

document.getElementById('add-notice-btn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('modal-title').textContent = 'お知らせ追加';
  document.getElementById('notice-title').value = '';
  document.getElementById('notice-content').value = '';
  document.getElementById('modal').classList.remove('hidden');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('modal-submit').addEventListener('click', async () => {
  const title = document.getElementById('notice-title').value.trim();
  const content = document.getElementById('notice-content').value.trim();

  if (!title || !content) {
    alert('タイトルと内容を入力してください');
    return;
  }

  let res;
  if (editingId) {
    res = await fetch(`${API}/notices/${editingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, content, is_active: true })
    });
  } else {
    res = await fetch(`${API}/notices/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, content })
    });
  }

  if (res.ok) {
    document.getElementById('modal').classList.add('hidden');
    fetchNotices();
  }
});

init();