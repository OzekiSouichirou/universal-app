const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
document.getElementById('logout-btn').addEventListener('click', logout);

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

async function init() {
  const me = await checkAuth(false);
  if (!me) return;
  document.getElementById('current-user').textContent = me.username;

  const params = new URLSearchParams(location.search);
  const username = params.get('u');
  if (!username) { location.href = 'home.html'; return; }

  document.getElementById('page-title').textContent = `${username} のプロフィール`;

  const res = await fetch(`${API}/users/profile/${encodeURIComponent(username)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    document.getElementById('user-profile-content').innerHTML =
      '<p style="color:var(--red);text-align:center;padding:40px;">ユーザーが見つかりません</p>';
    return;
  }

  const u = await res.json();

  // 称号・バッジ解析
  const titleItem = GACHA_POOL.find(i => i.id === u.selected_title);
  let badges = [];
  try { badges = JSON.parse(u.selected_badges || '[]'); } catch {}
  const badgeItems = badges.map(id => GACHA_POOL.find(i => i.id === id)).filter(Boolean);

  // アバター
  const avatarHtml = u.avatar
    ? `<img src="${u.avatar}" alt="${u.username}" style="width:100%;height:100%;object-fit:cover;">`
    : `<span style="font-size:36px;font-weight:700;color:#fff;">${u.username.charAt(0).toUpperCase()}</span>`;

  // XPバー
  const LEVEL_THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000];
  const curLvXP = LEVEL_THRESHOLDS[Math.min(u.level-1, LEVEL_THRESHOLDS.length-1)];
  const nxtLvXP = LEVEL_THRESHOLDS[Math.min(u.level, LEVEL_THRESHOLDS.length-1)];
  const pct = nxtLvXP > curLvXP ? Math.min(100, Math.round((u.xp - curLvXP) / (nxtLvXP - curLvXP) * 100)) : 100;

  document.getElementById('user-profile-content').innerHTML = `
    <div class="profile-box">
      <!-- ヘッダー -->
      <div class="uprofile-header">
        <div class="avatar-preview" style="width:80px;height:80px;font-size:32px;flex-shrink:0;">${avatarHtml}</div>
        <div class="uprofile-info">
          <div class="uprofile-name">
            <span style="font-size:20px;font-weight:800;">${u.username}</span>
            ${titleItem ? `<span class="profile-title-badge" style="background:${titleItem.color}22;border-color:${titleItem.color};color:${titleItem.color}">${titleItem.name}</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">
            ${badgeItems.map(b => `<span class="profile-badge-item" style="background:${b.color}22;border-color:${b.color}" title="${b.name}">${b.name.split(' ')[0]}</span>`).join('')}
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px;font-family:monospace;">${u.user_id || ''}</div>
        </div>
      </div>

      <!-- 自己紹介 -->
      ${u.bio ? `<div class="uprofile-bio">${u.bio}</div>` : ''}

      <!-- XP -->
      <div class="home-xp-bar-wrap" style="margin-top:16px;">
        <div class="home-xp-header">
          <span style="font-size:16px;font-weight:700;color:var(--accent-2);">Lv.${u.level}</span>
          <span style="font-size:13px;color:var(--text-2);">🔥 ${u.streak}日連続</span>
          <span id="home-xp-label" style="margin-left:auto;color:var(--text-3);font-size:12px;">${u.xp} / ${nxtLvXP} XP</span>
        </div>
        <div class="xp-bar-wrap">
          <div class="xp-bar" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- 統計 -->
      <div class="db-stat-row" style="margin-top:16px;">
        <div class="db-stat-card"><span class="db-stat-icon">✏️</span><div><div class="db-stat-value">${u.post_count}</div><div class="db-stat-label">投稿数</div></div></div>
        <div class="db-stat-card"><span class="db-stat-icon">⭐</span><div><div class="db-stat-value">${u.xp.toLocaleString()}</div><div class="db-stat-label">総XP</div></div></div>
        <div class="db-stat-card"><span class="db-stat-icon">📅</span><div><div class="db-stat-value">${new Date(u.created_at + 'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</div><div class="db-stat-label">登録日</div></div></div>
      </div>
    </div>
    <div style="margin-top:12px;">
      <button class="btn-secondary" onclick="history.back()">← 戻る</button>
    </div>
  `;
}

init();
