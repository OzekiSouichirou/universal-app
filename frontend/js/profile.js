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
  const img = document.getElementById('avatar-img');
  img.src = dataUrl; img.style.display = 'block';
  document.getElementById('avatar-initial').style.display = 'none';
  document.getElementById('avatar-delete-btn').style.display = 'inline-block';
}

function hideAvatar() {
  const img = document.getElementById('avatar-img');
  img.src = ''; img.style.display = 'none';
  document.getElementById('avatar-initial').style.display = 'block';
  document.getElementById('avatar-delete-btn').style.display = 'none';
}

// ============================================================
// アイコントリミングモーダル
// ============================================================
let _cropImg   = null;
let _cropScale = 1;
let _cropX     = 0;
let _cropY     = 0;
let _dragStart = null;

function openCropModal(file) {
  const url = URL.createObjectURL(file);
  const modal = document.getElementById('crop-modal');
  const canvas = document.getElementById('crop-canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  img.onload = () => {
    _cropImg   = img;
    _cropScale = 1;
    _cropX     = 0;
    _cropY     = 0;
    document.getElementById('crop-scale').value = 100;
    drawCrop();
    modal.classList.remove('hidden');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function drawCrop() {
  const canvas = document.getElementById('crop-canvas');
  const ctx    = canvas.getContext('2d');
  const size   = canvas.width; // 256px
  ctx.clearRect(0, 0, size, size);

  // 背景
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, size, size);

  const w = _cropImg.width  * _cropScale;
  const h = _cropImg.height * _cropScale;
  const x = size / 2 + _cropX - w / 2;
  const y = size / 2 + _cropY - h / 2;
  ctx.drawImage(_cropImg, x, y, w, h);

  // 円形マスクのガイド
  ctx.save();
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(91,110,245,0.8)';
  ctx.lineWidth   = 2;
  ctx.stroke();
  // 外側を暗くする
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.rect(0, 0, size, size);
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.restore();
}

// ズームスライダー
document.getElementById('crop-scale').addEventListener('input', e => {
  _cropScale = parseInt(e.target.value) / 100;
  drawCrop();
});

// ドラッグ操作
const cropCanvas = document.getElementById('crop-canvas');

function getPos(e) {
  const r = cropCanvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - r.left, y: src.clientY - r.top };
}

cropCanvas.addEventListener('mousedown',  e => { _dragStart = getPos(e); });
cropCanvas.addEventListener('touchstart', e => { e.preventDefault(); _dragStart = getPos(e); }, { passive: false });

cropCanvas.addEventListener('mousemove', e => {
  if (!_dragStart) return;
  const p = getPos(e);
  _cropX += p.x - _dragStart.x;
  _cropY += p.y - _dragStart.y;
  _dragStart = p;
  drawCrop();
});
cropCanvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!_dragStart) return;
  const p = getPos(e);
  _cropX += p.x - _dragStart.x;
  _cropY += p.y - _dragStart.y;
  _dragStart = p;
  drawCrop();
}, { passive: false });

cropCanvas.addEventListener('mouseup',   () => { _dragStart = null; });
cropCanvas.addEventListener('touchend',  () => { _dragStart = null; });
cropCanvas.addEventListener('mouseleave',() => { _dragStart = null; });

document.getElementById('crop-cancel-btn').addEventListener('click', () => {
  document.getElementById('crop-modal').classList.add('hidden');
  document.getElementById('avatar-input').value = '';
});

document.getElementById('crop-save-btn').addEventListener('click', async () => {
  const canvas  = document.getElementById('crop-canvas');
  const out     = document.createElement('canvas');
  out.width = out.height = 256;
  const ctx = out.getContext('2d');

  // 円形にクリップして書き出し
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(canvas, 0, 0);

  const dataUrl = out.toDataURL('image/jpeg', 0.85);
  const msg     = document.getElementById('avatar-msg');

  if (dataUrl.length > 2 * 1024 * 1024) {
    msg.style.color = '#f0476c'; msg.textContent = '画像が大きすぎます。ズームを下げてください';
    return;
  }

  document.getElementById('crop-modal').classList.add('hidden');
  msg.style.color = '#7a87aa'; msg.textContent = '保存中...';

  try {
    await api('/users/me/avatar', { method: 'PATCH', body: JSON.stringify({ avatar: dataUrl }) });
    showAvatar(dataUrl);
    msg.style.color = '#3ecf8e'; msg.textContent = 'アバターを更新しました';
  } catch(e) {
    msg.style.color = '#f0476c'; msg.textContent = e.message || '保存に失敗しました';
  }
  document.getElementById('avatar-input').value = '';
});

document.getElementById('avatar-upload-btn').addEventListener('click', () => {
  document.getElementById('avatar-input').click();
});

document.getElementById('avatar-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const msg = document.getElementById('avatar-msg');
  const allowed = ['image/jpeg','image/png','image/gif','image/heic','image/heif'];
  const isHeif  = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
  if (!allowed.includes(file.type) && !isHeif) {
    msg.style.color = '#f0476c'; msg.textContent = 'JPEG・PNG・GIF・HEIFのみ対応しています'; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    msg.style.color = '#f0476c'; msg.textContent = 'ファイルサイズは5MB以内にしてください'; return;
  }
  openCropModal(file);
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
  if (!current || !newPass || !confirm) { msg.style.color='#f0476c'; msg.textContent='すべての項目を入力してください'; return; }
  if (newPass !== confirm)              { msg.style.color='#f0476c'; msg.textContent='新しいパスワードが一致しません'; return; }
  try {
    await api('/users/me/password', { method:'PATCH', body:JSON.stringify({ current_password:current, new_password:newPass }) });
    msg.style.color = '#3ecf8e'; msg.textContent = 'パスワードを変更しました';
    ['current-password','new-password','confirm-password'].forEach(id => document.getElementById(id).value = '');
  } catch(e) { msg.style.color='#f0476c'; msg.textContent=e.message||'パスワード変更に失敗しました'; }
});

document.getElementById('delete-account-btn').addEventListener('click', async () => {
  if (!confirm('本当にアカウントを削除しますか？\nこの操作は取り消せません。')) return;
  if (!confirm('最終確認です。\nアカウントと全データが完全に削除されます。\n本当によろしいですか？')) return;
  try {
    await api('/users/me', { method:'DELETE' });
    alert('アカウントを削除しました。ご利用ありがとうございました。');
    logout();
  } catch(e) { alert(e.message || '削除に失敗しました'); }
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
      await api('/users/me/profile', { method:'PATCH', body:JSON.stringify({ bio, selected_title:title, selected_title_a:titleA, selected_title_b:titleB, selected_badges:'[]' }) });
      if (msg) { msg.style.color='var(--green)'; msg.textContent='プロフィールを保存しました'; }
      setTimeout(() => { if (msg) msg.textContent=''; }, 3000);
      renderEquipGrid(); renderPreview();
    } catch(e) {
      if (msg) { msg.style.color='var(--red)'; msg.textContent=e.message||'保存に失敗しました'; }
    }
  });
});

init();
