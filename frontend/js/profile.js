const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-user-id').textContent = user.user_id || '未設定';
  document.getElementById('profile-role').textContent = user.role === 'admin' ? '管理者' : '一般ユーザー';
  document.getElementById('profile-created').textContent = new Date(user.created_at + 'Z').toLocaleDateString('ja-JP', {timeZone: 'Asia/Tokyo'});
  document.getElementById('avatar-initial').textContent = user.username.charAt(0).toUpperCase();
  if (user.avatar) {
    showAvatar(user.avatar);
  }
}

function showAvatar(dataUrl) {
  const img = document.getElementById('avatar-img');
  const initial = document.getElementById('avatar-initial');
  img.src = dataUrl;
  img.style.display = 'block';
  initial.style.display = 'none';
  document.getElementById('avatar-delete-btn').style.display = 'inline-block';
}

function hideAvatar() {
  const img = document.getElementById('avatar-img');
  const initial = document.getElementById('avatar-initial');
  img.src = '';
  img.style.display = 'none';
  initial.style.display = 'block';
  document.getElementById('avatar-delete-btn').style.display = 'none';
}

async function convertToJpeg(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 512;
      let w = img.width;
      let h = img.height;
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像の読み込みに失敗しました')); };
    img.src = url;
  });
}

document.getElementById('avatar-upload-btn').addEventListener('click', () => {
  document.getElementById('avatar-input').click();
});

document.getElementById('avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById('avatar-msg');

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'image/heif'];
  const isHeif = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

  if (!allowed.includes(file.type) && !isHeif) {
    msg.style.color = '#f0476c';
    msg.textContent = 'JPEG・PNG・GIF・HEIFのみ対応しています';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    msg.style.color = '#f0476c';
    msg.textContent = 'ファイルサイズは5MB以内にしてください';
    return;
  }

  msg.style.color = '#7a87aa';
  msg.textContent = '変換中...';

  try {
    const dataUrl = await convertToJpeg(file);

    if (dataUrl.length > 2 * 1024 * 1024) {
      msg.style.color = '#f0476c';
      msg.textContent = '画像サイズが大きすぎます。小さい画像を使用してください';
      return;
    }

    const res = await fetch(`${API}/users/me/avatar`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ avatar: dataUrl })
    });

    if (res.ok) {
      showAvatar(dataUrl);
      msg.style.color = '#3ecf8e';
      msg.textContent = 'アバターを更新しました';
    } else {
      const _r0 = await res.json();
      const data = parseResponse(_r0, {});
      msg.style.color = '#f0476c';
      msg.textContent = data.detail;
    }
  } catch (err) {
    msg.style.color = '#f0476c';
    msg.textContent = '画像の処理に失敗しました';
  }

  e.target.value = '';
});

document.getElementById('avatar-delete-btn').addEventListener('click', async () => {
  if (!confirm('アバターを削除しますか？')) return;
  const msg = document.getElementById('avatar-msg');
  const res = await fetch(`${API}/users/me/avatar`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    hideAvatar();
    msg.style.color = '#3ecf8e';
    msg.textContent = 'アバターを削除しました';
  }
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const current = document.getElementById('current-password').value.trim();
  const newPass = document.getElementById('new-password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();
  const msg = document.getElementById('password-msg');

  if (!current || !newPass || !confirm) {
    msg.style.color = '#f0476c';
    msg.textContent = 'すべての項目を入力してください';
    return;
  }

  if (newPass !== confirm) {
    msg.style.color = '#f0476c';
    msg.textContent = '新しいパスワードが一致しません';
    return;
  }

  const res = await fetch(`${API}/users/me/password`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ current_password: current, new_password: newPass })
  });

  const _r1 = await res.json();
  const data = parseResponse(_r1, {});

  if (res.ok) {
    msg.style.color = '#3ecf8e';
    msg.textContent = 'パスワードを変更しました';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
  } else {
    msg.style.color = '#f0476c';
    msg.textContent = data.detail;
  }
});

document.getElementById('delete-account-btn').addEventListener('click', async () => {
  const first = confirm('本当にアカウントを削除しますか？\nこの操作は取り消せません。');
  if (!first) return;

  const second = confirm('最終確認です。\nアカウントと全データが完全に削除されます。\n本当によろしいですか？');
  if (!second) return;

  const res = await fetch(`${API}/users/me`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (res.ok) {
    alert('アカウントを削除しました。ご利用ありがとうございました。');
    logout();
  } else {
    const _r2 = await res.json();
    const data = parseResponse(_r2, {});
    alert(data.detail);
  }
});

init();
