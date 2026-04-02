document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-user-id').textContent  = user.user_id || '未設定';
  document.getElementById('profile-role').textContent     = user.role === 'admin' ? '管理者' : '一般ユーザー';
  document.getElementById('profile-created').textContent  = new Date(user.created_at + 'Z').toLocaleDateString('ja-JP', {timeZone:'Asia/Tokyo'});
  document.getElementById('avatar-initial').textContent   = user.username.charAt(0).toUpperCase();
  if (user.avatar) showAvatar(user.avatar);
  if (typeof buildEquipUI === 'function') await buildEquipUI(user);
}

function showAvatar(dataUrl) {
  const img     = document.getElementById('avatar-img');
  const initial = document.getElementById('avatar-initial');
  img.src = dataUrl; img.style.display = 'block'; initial.style.display = 'none';
  document.getElementById('avatar-delete-btn').style.display = 'inline-block';
}

function hideAvatar() {
  const img     = document.getElementById('avatar-img');
  const initial = document.getElementById('avatar-initial');
  img.src = ''; img.style.display = 'none'; initial.style.display = 'block';
  document.getElementById('avatar-delete-btn').style.display = 'none';
}

async function toJpeg(file) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const img    = new Image();
    const url    = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 512;
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else       { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
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

  const allowed = ['image/jpeg','image/png','image/gif','image/heic','image/heif'];
  const isHeif  = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (!allowed.includes(file.type) && !isHeif) {
    msg.style.color = '#f0476c'; msg.textContent = 'JPEG・PNG・GIF・HEIFのみ対応しています'; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    msg.style.color = '#f0476c'; msg.textContent = 'ファイルサイズは5MB以内にしてください'; return;
  }

  msg.style.color = '#7a87aa'; msg.textContent = '変換中...';

  try {
    const dataUrl = await toJpeg(file);
    if (dataUrl.length > 2 * 1024 * 1024) {
      msg.style.color = '#f0476c'; msg.textContent = '画像サイズが大きすぎます。小さい画像を使用してください'; return;
    }
    await api('/users/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: dataUrl }) });
    showAvatar(dataUrl);
    msg.style.color = '#3ecf8e'; msg.textContent = 'アバターを更新しました';
  } catch(err) {
    msg.style.color = '#f0476c';
    msg.textContent = err.message || '画像の処理に失敗しました';
  }
  e.target.value = '';
});

document.getElementById('avatar-delete-btn').addEventListener('click', async () => {
  if (!confirm('アバターを削除しますか？')) return;
  const msg = document.getElementById('avatar-msg');
  try {
    await api('/users/me/avatar', { method: 'DELETE' });
    hideAvatar();
    msg.style.color = '#3ecf8e'; msg.textContent = 'アバターを削除しました';
  } catch(e) {
    msg.style.color = '#f0476c'; msg.textContent = e.message || '削除に失敗しました';
  }
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const current = document.getElementById('current-password').value.trim();
  const newPass = document.getElementById('new-password').value.trim();
  const confirm = document.getElementById('confirm-password').value.trim();
  const msg     = document.getElementById('password-msg');

  if (!current || !newPass || !confirm) {
    msg.style.color = '#f0476c'; msg.textContent = 'すべての項目を入力してください'; return;
  }
  if (newPass !== confirm) {
    msg.style.color = '#f0476c'; msg.textContent = '新しいパスワードが一致しません'; return;
  }

  try {
    await api('/users/me/password', { method: 'PATCH', body: JSON.stringify({ current_password: current, new_password: newPass }) });
    msg.style.color = '#3ecf8e'; msg.textContent = 'パスワードを変更しました';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
  } catch(e) {
    msg.style.color = '#f0476c'; msg.textContent = e.message || 'パスワード変更に失敗しました';
  }
});

document.getElementById('delete-account-btn').addEventListener('click', async () => {
  if (!confirm('本当にアカウントを削除しますか？\nこの操作は取り消せません。')) return;
  if (!confirm('最終確認です。\nアカウントと全データが完全に削除されます。\n本当によろしいですか？')) return;
  try {
    await api('/users/me', { method: 'DELETE' });
    alert('アカウントを削除しました。ご利用ありがとうございました。');
    logout();
  } catch(e) {
    alert(e.message || '削除に失敗しました');
  }
});

// ============================================================
// 称号装備UI
// ============================================================
let selectedTitleA = '';
let selectedTitleB = '';

async function buildEquipUI(user) {
  selectedTitleA = user.selected_title_a || '';
  selectedTitleB = user.selected_title_b || '';
  if (typeof fetchInventoryFromDB === 'function') await fetchInventoryFromDB();
  const bioInput = document.getElementById('bio-input');
  if (bioInput) {
    bioInput.value = user.bio || '';
    const bioCount = document.getElementById('bio-count');
    if (bioCount) bioCount.textContent = `${bioInput.value.length} / 200`;
    bioInput.addEventListener('input', () => { if (bioCount) bioCount.textContent = `${bioInput.value.length} / 200`; });
  }
  renderEquipGrid();
  renderPreview();
}

function renderEquipGrid() {
  const invA  = typeof getInventoryA === 'function' ? getInventoryA() : [];
  const invB  = typeof getInventoryB === 'function' ? getInventoryB() : [];
  const order = ['SECR','UR','SSR','SR','R','N'];
  const sort  = (a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity);
  const list  = document.getElementById('title-list');
  if (!list) return;

  if (!invA.length && !invB.length) {
    list.innerHTML = '<p style="font-size:12px;color:var(--text-3);">まだ称号がありません。ゲーム関連ページでガチャを引いてください！</p>';
    const badge = document.getElementById('badge-list');
    if (badge) badge.innerHTML = '';
    return;
  }

  const mkBtn = (item, type, sel) => {
    const col = (typeof GACHA_RARITY !== 'undefined' && GACHA_RARITY[item.rarity]?.color) || '#888';
    return `<button class="equip-btn ${sel === item.text ? 'equipped' : ''}"
      data-text="${item.text.replace(/"/g,'&quot;')}" data-type="${type}" style="--item-color:${col}">
      <span class="equip-rarity" style="color:${col}">${item.rarity}</span>
      <span class="equip-name">${item.text}</span>
    </button>`;
  };

  list.innerHTML = `
    <div class="equip-group">
      <div class="equip-group-label" style="color:var(--accent-2);">A（形容詞）</div>
      <div class="equip-btn-wrap">${[...invA].sort(sort).map(i => mkBtn(i,'A',selectedTitleA)).join('')}</div>
    </div>
    <div class="equip-group" style="margin-top:10px;">
      <div class="equip-group-label" style="color:var(--blue);">B（役割）</div>
      <div class="equip-btn-wrap">${[...invB].sort(sort).map(i => mkBtn(i,'B',selectedTitleB)).join('')}</div>
    </div>`;

  const badge = document.getElementById('badge-list');
  if (badge) badge.innerHTML = '';

  document.querySelectorAll('.equip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { type, text } = btn.dataset;
      if (type === 'A') selectedTitleA = selectedTitleA === text ? '' : text;
      if (type === 'B') selectedTitleB = selectedTitleB === text ? '' : text;
      renderEquipGrid(); renderPreview();
    });
  });
}

function renderPreview() {
  const preview = document.getElementById('equip-preview');
  if (!preview) return;
  if (!selectedTitleA && !selectedTitleB) { preview.innerHTML = ''; return; }
  const full = `${selectedTitleA || '???'} ${selectedTitleB || '???'}`;
  preview.innerHTML = `<div class="equip-preview-inner">
    <div class="equip-preview-label">プレビュー（二つ名）</div>
    <div class="equip-preview-content">
      <span class="profile-title-badge" style="background:var(--accent)22;border-color:var(--accent);color:var(--accent-2)">${full}</span>
    </div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-profile-btn');
  const msg     = document.getElementById('profile-save-msg');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const bio    = (document.getElementById('bio-input')?.value || '').trim();
    const titleA = selectedTitleA || '';
    const titleB = selectedTitleB || '';
    const title  = (titleA && titleB) ? `${titleA} ${titleB}` : (titleA || titleB);
    try {
      await api('/users/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ bio, selected_title: title, selected_title_a: titleA, selected_title_b: titleB, selected_badges: '[]' })
      });
      if (msg) { msg.style.color = 'var(--green)'; msg.textContent = 'プロフィールを保存しました'; }
      setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
      renderEquipGrid(); renderPreview();
    } catch(e) {
      if (msg) { msg.style.color = 'var(--red)'; msg.textContent = e.message || '保存に失敗しました'; }
    }
  });
});

init();
