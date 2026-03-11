const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  fetchUsers();
}

async function fetchUsers() {
  const res = await fetch(`${API}/users/`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const users = Array.isArray(data) ? data : [];
  renderUsers(users);
}

function renderUsers(users) {
  const tbody = document.getElementById('user-table-body');
  tbody.innerHTML = '';

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td>
        <select class="role-select" data-id="${u.id}">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>一般ユーザー</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理者</option>
        </select>
      </td>
      <td>${new Date(u.created_at).toLocaleDateString('ja-JP')}</td>
      <td><button class="btn-danger" data-id="${u.id}">削除</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.role-select').forEach(select => {
    select.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      await fetch(`${API}/users/${id}/role`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: e.target.value })
      });
    });
  });

  document.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (!confirm('このユーザーを削除しますか？')) return;
      const res = await fetch(`${API}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.detail);
      }
    });
  });
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  document.getElementById('modal').classList.remove('hidden');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('modal-submit').addEventListener('click', async () => {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value.trim();
  const role = document.getElementById('new-role').value;

  if (!username || !password) {
    alert('ユーザー名とパスワードを入力してください');
    return;
  }

  const res = await fetch(`${API}/users/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password, role })
  });

  if (res.ok) {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
    fetchUsers();
  } else {
    const data = await res.json();
    alert(data.detail);
  }
});

init();