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
  buildEquipUI(user);
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

// ===================== ガチャアイテムデータ（game.jsと共通） =====================
const GACHA_POOL = [
  { id:'badge_fire',    name:'🔥 炎バッジ',        rarity:'N',  color:'#f76c24', type:'badge' },
  { id:'badge_water',   name:'💧 水バッジ',        rarity:'N',  color:'#538eed', type:'badge' },
  { id:'badge_grass',   name:'🌿 草バッジ',        rarity:'N',  color:'#5dbd58', type:'badge' },
  { id:'badge_electric',name:'⚡ 電気バッジ',      rarity:'N',  color:'#f5cc17', type:'badge' },
  { id:'badge_ice',     name:'❄️ 氷バッジ',        rarity:'R',  color:'#75d5d5', type:'badge' },
  { id:'badge_dragon',  name:'🐉 ドラゴンバッジ',  rarity:'R',  color:'#0a6ac9', type:'badge' },
  { id:'badge_psychic', name:'🔮 エスパーバッジ',  rarity:'R',  color:'#f461af', type:'badge' },
  { id:'badge_ghost',   name:'👻 ゴーストバッジ',  rarity:'SR', color:'#5064aa', type:'badge' },
  { id:'badge_dark',    name:'🌑 あくバッジ',      rarity:'SR', color:'#5b5369', type:'badge' },
  { id:'badge_fairy',   name:'🌸 フェアリーバッジ',rarity:'SR', color:'#ed76d0', type:'badge' },
  { id:'title_champion',name:'👑 チャンピオン',    rarity:'SSR',color:'#f5a623', type:'title' },
  { id:'title_legend',  name:'⭐ 伝説使い',        rarity:'SSR',color:'#e87aaa', type:'title' },
];
const RARITY_COLOR = { N:'#8892b0', R:'#3ecf8e', SR:'#41b4f5', SSR:'#f5a623' };

let inventory = JSON.parse(localStorage.getItem('gacha_inventory') || '[]');
let selectedTitle = '';
let selectedBadges = [];

function buildEquipUI(user) {
  // 現在の装備を復元
  selectedTitle = user.selected_title || '';
  try { selectedBadges = JSON.parse(user.selected_badges || '[]'); } catch { selectedBadges = []; }

  // 自己紹介
  const bioInput = document.getElementById('bio-input');
  bioInput.value = user.bio || '';
  document.getElementById('bio-count').textContent = `${bioInput.value.length} / 200`;
  bioInput.addEventListener('input', () => {
    document.getElementById('bio-count').textContent = `${bioInput.value.length} / 200`;
  });

  renderEquipGrid();
  renderPreview();
}

function renderEquipGrid() {
  const titles = GACHA_POOL.filter(i => i.type === 'title');
  const badges = GACHA_POOL.filter(i => i.type === 'badge');

  // 称号リスト
  const titleList = document.getElementById('title-list');
  titleList.innerHTML = titles.map(item => {
    const owned = inventory.find(i => i.id === item.id);
    const selected = selectedTitle === item.id;
    return `
      <button class="equip-btn ${selected ? 'equipped' : ''} ${!owned ? 'not-owned' : ''}"
        data-id="${item.id}" data-type="title"
        style="--item-color:${item.color}"
        ${!owned ? 'title="未所持"' : ''}>
        <span class="equip-rarity" style="color:${RARITY_COLOR[item.rarity]}">${item.rarity}</span>
        <span class="equip-name">${item.name}</span>
        ${!owned ? '<span class="equip-lock">🔒</span>' : ''}
      </button>`;
  }).join('');

  // バッジリスト
  const badgeList = document.getElementById('badge-list');
  badgeList.innerHTML = badges.map(item => {
    const owned = inventory.find(i => i.id === item.id);
    const selected = selectedBadges.includes(item.id);
    return `
      <button class="equip-btn ${selected ? 'equipped' : ''} ${!owned ? 'not-owned' : ''}"
        data-id="${item.id}" data-type="badge"
        style="--item-color:${item.color}"
        ${!owned ? 'title="未所持"' : ''}>
        <span class="equip-rarity" style="color:${RARITY_COLOR[item.rarity]}">${item.rarity}</span>
        <span class="equip-name">${item.name}</span>
        ${selected ? `<span class="equip-slot">${selectedBadges.indexOf(item.id)+1}</span>` : ''}
        ${!owned ? '<span class="equip-lock">🔒</span>' : ''}
      </button>`;
  }).join('');

  // クリックイベント
  document.querySelectorAll('.equip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      const owned = inventory.find(i => i.id === id);
      if (!owned) return; // 未所持は選択不可

      if (type === 'title') {
        selectedTitle = selectedTitle === id ? '' : id;
      } else {
        if (selectedBadges.includes(id)) {
          selectedBadges = selectedBadges.filter(b => b !== id);
        } else {
          if (selectedBadges.length >= 3) {
            selectedBadges.shift(); // 3つ超えたら一番古いを削除
          }
          selectedBadges.push(id);
        }
      }
      renderEquipGrid();
      renderPreview();
    });
  });
}

function renderPreview() {
  const preview = document.getElementById('equip-preview');
  const titleItem = GACHA_POOL.find(i => i.id === selectedTitle);
  const badgeItems = selectedBadges.map(id => GACHA_POOL.find(i => i.id === id)).filter(Boolean);

  if (!titleItem && badgeItems.length === 0) {
    preview.innerHTML = '';
    return;
  }

  preview.innerHTML = `
    <div class="equip-preview-inner">
      <div class="equip-preview-label">プレビュー</div>
      <div class="equip-preview-content">
        ${titleItem ? `<span class="profile-title-badge" style="background:${titleItem.color}22;border-color:${titleItem.color};color:${titleItem.color}">${titleItem.name}</span>` : ''}
        <div class="equip-preview-badges">
          ${badgeItems.map(b => `<span class="profile-badge-item" style="background:${b.color}22;border-color:${b.color}" title="${b.name}">${b.name.split(' ')[0]}</span>`).join('')}
        </div>
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
      selected_title: selectedTitle,
      selected_badges: JSON.stringify(selectedBadges),
    })
  });

  if (res.ok) {
    msg.style.color = '#3ecf8e';
    msg.textContent = '✓ プロフィールを保存しました';
    setTimeout(() => msg.textContent = '', 3000);
  } else {
    const data = await res.json();
    msg.style.color = '#f0476c';
    msg.textContent = data.detail;
  }
});

