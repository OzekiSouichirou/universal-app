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
  await buildEquipUI(user);
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
      const data = await res.json();
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

  const data = await res.json();

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
    const data = await res.json();
    alert(data.detail);
  }
});

init();

// ガチャデータはgacha-data.jsで定義
let inventory = JSON.parse(localStorage.getItem('gacha_inventory') || '[]');
let selectedTitleA = '';
let selectedTitleB = '';
let selectedBadges = [];

async function buildEquipUI(user) {
  // まずDBからインベントリを取得してからselectedをセット
  await fetchInventoryFromDB(token, API);

  selectedTitleA = user.selected_title_a || '';
  selectedTitleB = user.selected_title_b || '';

  console.log('[profile] selectedTitleA:', selectedTitleA, 'selectedTitleB:', selectedTitleB);
  console.log('[profile] invA:', getInventoryA().map(i=>i.text));
  console.log('[profile] invB:', getInventoryB().map(i=>i.text));

  const bioInput = document.getElementById('bio-input');
  bioInput.value = user.bio || '';
  document.getElementById('bio-count').textContent = `${bioInput.value.length} / 200`;
  bioInput.removeEventListener('input', bioInput._handler);
  bioInput._handler = () => {
    document.getElementById('bio-count').textContent = `${bioInput.value.length} / 200`;
  };
  bioInput.addEventListener('input', bioInput._handler);

  renderEquipGrid();
  renderPreview();
}

function renderEquipGrid() {
  const invA = getInventoryA();
  const invB = getInventoryB();
  const order = ['SECR','UR','SSR','SR','R','N'];
  const sortFn = (a,b) => order.indexOf(a.rarity) - order.indexOf(b.rarity);

  const titleList = document.getElementById('title-list');

  if (invA.length === 0 && invB.length === 0) {
    titleList.innerHTML = `<p style="font-size:12px;color:var(--text-3);">まだ称号がありません。ゲーム関連ページでガチャを引いてください！</p>`;
    document.getElementById('badge-list').innerHTML = '';
    return;
  }

  const mkBtn = (item, type, selectedVal, selColor) => {
    const col = GACHA_RARITY[item.rarity]?.color || '#888';
    const selected = selectedVal === item.text;
    return `<button class="equip-btn ${selected ? 'equipped' : ''}"
      data-text="${item.text.replace(/"/g,'&quot;')}" data-type="${type}"
      style="--item-color:${col}">
      <span class="equip-rarity" style="color:${col}">${item.rarity}</span>
      <span class="equip-name">${item.text}</span>
      ${item.count > 1 ? `<span class="equip-slot">×${item.count}</span>` : ''}
    </button>`;
  };

  const sortedA = [...invA].sort(sortFn);
  const sortedB = [...invB].sort(sortFn);

  titleList.innerHTML = `
    <div class="equip-group">
      <div class="equip-group-label" style="color:var(--accent-2);">A（形容詞）</div>
      <div class="equip-btn-wrap">${sortedA.map(i => mkBtn(i,'A',selectedTitleA)).join('')}</div>
    </div>
    <div class="equip-group" style="margin-top:10px;">
      <div class="equip-group-label" style="color:var(--blue);">B（役割）</div>
      <div class="equip-btn-wrap">${sortedB.map(i => mkBtn(i,'B',selectedTitleB)).join('')}</div>
    </div>`;

  document.getElementById('badge-list').innerHTML = '';

  document.querySelectorAll('.equip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.text;
      const type = btn.dataset.type;
      if (type === 'A') selectedTitleA = selectedTitleA === text ? '' : text;
      if (type === 'B') selectedTitleB = selectedTitleB === text ? '' : text;
      renderEquipGrid();
      renderPreview();
    });
  });
}

function renderPreview() {
  const preview = document.getElementById('equip-preview');
  if (!selectedTitleA && !selectedTitleB) { preview.innerHTML = ''; return; }
  const full = `${selectedTitleA || '???'} ${selectedTitleB || '???'}`;
  preview.innerHTML = `
    <div class="equip-preview-inner">
      <div class="equip-preview-label">プレビュー（二つ名）</div>
      <div class="equip-preview-content">
        <span class="profile-title-badge" style="background:var(--accent)22;border-color:var(--accent);color:var(--accent-2)">${full}</span>
      </div>
    </div>`;
}
document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const bio = document.getElementById('bio-input').value.trim();
  const msg = document.getElementById('profile-save-msg');

  const res = await fetch(`${API}/users/me/profile`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bio,
      selected_title: selectedTitleA && selectedTitleB ? `${selectedTitleA} ${selectedTitleB}` : (selectedTitleA || selectedTitleB),
      selected_title_a: selectedTitleA,
      selected_title_b: selectedTitleB,
      selected_badges: '[]',
    })
  });

  if (res.ok) {
    const saved = await res.json();
    // 保存成功後にselectedTitleA/Bをレスポンスで更新
    if (saved.selected_title_a !== undefined) selectedTitleA = saved.selected_title_a;
    if (saved.selected_title_b !== undefined) selectedTitleB = saved.selected_title_b;
    msg.style.color = '#3ecf8e';
    msg.textContent = '✓ プロフィールを保存しました';
    renderEquipGrid();
    renderPreview();
    setTimeout(() => msg.textContent = '', 3000);
  } else {
    const data = await res.json();
    msg.style.color = '#f0476c';
    msg.textContent = data.detail || '保存に失敗しました';
  }
});

