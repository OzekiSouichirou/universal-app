async function init() {
  const me = await checkAuth(false);
  if (!me) return;
  document.getElementById('current-user').textContent = me.username;

  const params   = new URLSearchParams(location.search);
  const username = params.get('u');
  if (!username) { location.href = 'home.html'; return; }

  document.getElementById('page-title').textContent = `${username} のプロフィール`;

  const u = await api(`/users/profile/${encodeURIComponent(username)}`).catch(() => null);
  if (!u) {
    document.getElementById('user-profile-content').innerHTML =
      '<p style="color:var(--red);text-align:center;padding:40px;">ユーザーが見つかりません</p>';
    return;
  }

  const LEVEL_THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000];
  const curLvXP = LEVEL_THRESHOLDS[Math.min(u.level-1, LEVEL_THRESHOLDS.length-1)];
  const nxtLvXP = LEVEL_THRESHOLDS[Math.min(u.level,   LEVEL_THRESHOLDS.length-1)];
  const pct     = nxtLvXP>curLvXP ? Math.min(100, Math.round((u.xp-curLvXP)/(nxtLvXP-curLvXP)*100)) : 100;

  const avatarHtml = u.avatar
    ? `<img src="${u.avatar}" alt="${u.username}" style="width:100%;height:100%;object-fit:cover;">`
    : `<span style="font-size:36px;font-weight:700;color:#fff;">${u.username.charAt(0).toUpperCase()}</span>`;

  document.getElementById('user-profile-content').innerHTML = `
    <div class="profile-box">
      <div class="uprofile-header">
        <div class="avatar-preview" style="width:80px;height:80px;font-size:32px;flex-shrink:0;">${avatarHtml}</div>
        <div class="uprofile-info">
          <div class="uprofile-name">
            <span style="font-size:20px;font-weight:800;">${u.username}</span>
            ${u.selected_title?`<span class="profile-title-badge" style="background:var(--accent)22;border-color:var(--accent);color:var(--accent-2)">${u.selected_title}</span>`:''}
          </div>
          <div style="font-size:12px;color:var(--text-3);margin-top:4px;font-family:monospace;">${u.user_id||''}</div>
        </div>
      </div>
      ${u.bio?`<div class="uprofile-bio">${u.bio}</div>`:''}
      <div class="home-xp-bar-wrap" style="margin-top:16px;">
        <div class="home-xp-header">
          <span style="font-size:16px;font-weight:700;color:var(--accent-2);">Lv.${u.level}</span>
          <span style="font-size:13px;color:var(--text-2);">🔥 ${u.streak}日連続</span>
          <span style="margin-left:auto;color:var(--text-3);font-size:12px;">${u.xp} / ${nxtLvXP} XP</span>
        </div>
        <div class="xp-bar-wrap"><div class="xp-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="db-stat-row" style="margin-top:16px;">
        <div class="db-stat-card"><span class="db-stat-icon">✏️</span><div><div class="db-stat-value">${u.post_count}</div><div class="db-stat-label">投稿数</div></div></div>
        <div class="db-stat-card"><span class="db-stat-icon">⭐</span><div><div class="db-stat-value">${u.xp.toLocaleString()}</div><div class="db-stat-label">総XP</div></div></div>
        <div class="db-stat-card"><span class="db-stat-icon">📅</span><div><div class="db-stat-value">${new Date(u.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</div><div class="db-stat-label">登録日</div></div></div>
      </div>
    </div>
    <div style="margin-top:12px;"><button class="btn-secondary" onclick="history.back()">← 戻る</button></div>`;
}

init();
