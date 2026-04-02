// parseResponseフォールバック（api.jsが読み込まれていない場合の保険）
if (typeof parseResponse === 'undefined') {
  window.parseResponse = function(json, fallback) {
    if (json && json.success === true) return json.data;
    if (json && json.success === false) return fallback;
    return json != null ? json : fallback;
  };
}

const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

document.getElementById('logout-btn').addEventListener('click', logout);



async function init() {
  const user = await checkAuth(false);
  if (!user) {
    // ネットワークエラー時もトークンがあれば画面は維持する
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;
    await loadNotices().catch(() => {});
    return;
  }
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;

  await Promise.all([loadNotices(), loadStats(), loadTodayEvents(), loadTodayTimetable(), loadFortune(), loadMissions(), loadExamCountdown()]);
}

async function loadNotices() {
  const res = await fetch(`${API}/notices/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  // v0.9.0統一レスポンス形式対応
  const notices = (data && data.success === true) ? (data.data || []) : (Array.isArray(data) ? data : []);
  const list = document.getElementById('notice-list');
  if (notices.length === 0) {
    list.innerHTML = '<li class="notice-item">現在お知らせはありません</li>';
    return;
  }
  list.innerHTML = notices.map(n => `
    <li class="notice-item">
      <strong>${n.title}</strong>
      <p>${n.content}</p>
    </li>
  `).join('');
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/stats/me`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const json = await res.json();
    // v0.9.0統一レスポンス形式対応
    const me = (json && json.success === true) ? json.data : json;

    document.getElementById('home-stat-cards').innerHTML = [
      { label: '自分の投稿数',     value: me.my_posts    ?? '-', icon: '+' },
      { label: '受け取ったいいね', value: me.my_likes    ?? '-', icon: '♡' },
      { label: '自分のコメント',   value: me.my_comments ?? '-', icon: '#' },
      { label: 'レベル',          value: 'Lv.' + (me.level ?? 1), icon: 'Lv' },
    ].map(c => `
      <div class="db-stat-card">
        <span class="db-stat-icon">${c.icon}</span>
        <div>
          <div class="db-stat-value">${c.value}</div>
          <div class="db-stat-label">${c.label}</div>
        </div>
      </div>
    `).join('');

    document.getElementById('home-xp-level').textContent = `Lv.${me.level ?? 1}`;
    document.getElementById('home-xp-streak').textContent = `${me.streak ?? 0}日連続`;

    const xpRes = await fetch(`${API}/calendar/xp`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (xpRes.ok) {
      const xpJson = await xpRes.json();
      const xp = (xpJson && xpJson.success === true) ? xpJson.data : xpJson;
      const range = (xp.next_level_xp ?? 100) - (xp.current_level_xp ?? 0);
      const progress = (xp.xp ?? 0) - (xp.current_level_xp ?? 0);
      const pct = range > 0 ? Math.min(100, Math.round(progress / range * 100)) : 100;
      document.getElementById('home-xp-bar').style.width = pct + '%';
      document.getElementById('home-xp-label').textContent = `${xp.xp ?? 0} / ${xp.next_level_xp ?? 100} XP`;
    }
  } catch(e) {
    console.warn('loadStats error:', e);
  }
}



async function loadTodayEvents() {
  const res = await fetch(`${API}/calendar/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('home-today-events');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const evJson = await res.json();
  const events = (evJson && evJson.success === true) ? evJson.data : evJson;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const items = events.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  const TYPE_ICONS = { memo:'', schedule:'', exam:'', deadline:'', event:'' };
  if (items.length === 0) { el.innerHTML = '<p class="db-empty">予定なし</p>'; return; }
  el.innerHTML = items.map(e => `
    <div class="db-list-item">
      <span>${TYPE_ICONS[e.type] || ''}</span>
      <span class="db-list-text">${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>
  `).join('');
}

async function loadTodayTimetable() {
  const res = await fetch(`${API}/timetable/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('home-today-tt');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const ttRaw = await res.json();
  const all = parseResponse(ttRaw, []);
  const dow = new Date().getDay();
  const dayIdx = dow === 0 ? -1 : dow - 1;
  if (dayIdx < 0) { el.innerHTML = '<p class="db-empty">今日は日曜日</p>'; return; }
  const nowHour = new Date().getHours();
  const PERIOD_HOURS = [9, 10, 12, 14, 15, 16];
  const todayEntries = all.filter(e => e.day === dayIdx).sort((a, b) => a.period - b.period);
  if (todayEntries.length === 0) { el.innerHTML = '<p class="db-empty">今日の授業なし</p>'; return; }
  el.innerHTML = todayEntries.map(e => {
    const isCurrent = PERIOD_HOURS[e.period - 1] !== undefined &&
      nowHour >= PERIOD_HOURS[e.period - 1] && nowHour < (PERIOD_HOURS[e.period - 1] + 2);
    return `
      <div class="db-list-item ${isCurrent ? 'db-tt-now' : ''}">
        <span class="db-tt-period">${e.period}限</span>
        <span class="db-list-text" style="color:${e.color}">${e.subject}</span>
        ${e.room ? `<span class="db-tt-room">${e.room}</span>` : ''}
      </div>
    `;
  }).join('');
}

async function loadFortune() {
  try {
    const res = await fetch(`${API}/users/fortune/today`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const json = await res.json();
    const f = (json && json.success === true) ? json.data : json;
    const box = document.getElementById('fortune-box');
    if (!box) return;
    document.getElementById('fortune-rank').textContent = f.rank;
    document.getElementById('fortune-rank').style.color =
      {'大吉':'#f5a623','中吉':'#3ecf8e','小吉':'#41b4f5',
       '吉':'#8892b0','末吉':'#b899c0','凶':'#f0476c','大凶':'#b06ef5'}[f.rank] || 'var(--text)';
    document.getElementById('fortune-msg').textContent = f.msg;
    const xpEl = document.getElementById('fortune-xp');
    if (f.xp_gained > 0) { xpEl.textContent = `+${f.xp_gained} XP`; xpEl.style.display = 'block'; }
    else if (f.already_gained) { xpEl.textContent = '本日取得済み'; xpEl.style.display = 'block'; }
    box.style.display = 'block';
  } catch(e) { console.warn('loadFortune error:', e); }
}

async function loadMissions() {
  try {
    setMission('login', true);

    const postsData = await fetchData(`${API}/stats/me`, {}, {});
    const today = new Date().toISOString().slice(0, 10);
    const trend = postsData?.post_trend || [];
    const todayEntry = trend.find(t => {
      const mm = String(new Date().getMonth() + 1).padStart(2, '0');
      const dd = String(new Date().getDate()).padStart(2, '0');
      return t.date === `${mm}/${dd}`;
    });
    const postedToday = todayEntry && todayEntry.count > 0;
    setMission('post', !!postedToday);

    const calendarPostedToday = localStorage.getItem('polonix_calendar_today') === today;
    setMission('calendar', calendarPostedToday);
  } catch(e) { console.warn('loadMissions error:', e); }
}

function setMission(id, done) {
  const item = document.getElementById(`mission-${id}`);
  const status = document.getElementById(`ms-${id}`);
  if (!item || !status) return;
  if (done) {
    item.classList.add('done');
    status.textContent = '達成済み';
  } else {
    item.classList.remove('done');
    status.textContent = '未達成';
  }
}

async function loadExamCountdown() {
  try {
    const res = await fetch(`${API}/calendar/`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const raw = await res.json();
    const events = parseResponse(raw, []);
    const today = new Date();
    today.setHours(0,0,0,0);

    // 未完了の試験イベントを取得・日付順にソート
    const exams = events
      .filter(e => e.type === 'exam' && !e.is_done)
      .map(e => ({ ...e, daysLeft: Math.ceil((new Date(e.date) - today) / 86400000) }))
      .filter(e => e.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (exams.length === 0) return;

    const next = exams[0];
    const color = next.daysLeft <= 3 ? 'var(--red)' : next.daysLeft <= 7 ? 'var(--gold, #f5a623)' : 'var(--accent)';

    // カードをhome-gridの前に挿入
    const grid = document.querySelector('.home-grid');
    if (!grid || document.getElementById('exam-countdown')) return;

    const card = document.createElement('div');
    card.className = 'db-card';
    card.id = 'exam-countdown';
    card.style.marginBottom = '12px';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">直近の試験</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${next.title}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px;">${next.date}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:36px;font-weight:800;color:${color};line-height:1;">${next.daysLeft}</div>
          <div style="font-size:11px;color:var(--text-3);">日後</div>
        </div>
      </div>
      ${exams.length > 1 ? `<div style="font-size:11px;color:var(--text-3);margin-top:8px;">他 ${exams.length - 1} 件の試験あり</div>` : ''}
    `;
    grid.parentNode.insertBefore(card, grid);
  } catch(e) { console.warn('loadExamCountdown error:', e); }
}

init();
