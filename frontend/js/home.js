const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let chartTrend = null;

document.getElementById('logout-btn').addEventListener('click', logout);

const CHART_DEFAULTS = {
  color: '#e4e9f7', gridColor: '#1e2640',
  accent: '#5b6ef5', accent2: '#7b8cf7',
};

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;

  await Promise.all([loadNotices(), loadStats(), loadTodayEvents(), loadTodayTimetable(), loadFortune()]);
}

async function loadNotices() {
  const res = await fetch(`${API}/notices/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await res.json();
  const notices = Array.isArray(data) ? data : [];
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
  const res = await fetch(`${API}/stats/me`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return;
  const me = await res.json();

  document.getElementById('home-stat-cards').innerHTML = [
    { label: '自分の投稿数',     value: me.my_posts,    icon: '✏️' },
    { label: '受け取ったいいね', value: me.my_likes,    icon: '❤️' },
    { label: '自分のコメント',   value: me.my_comments, icon: '💬' },
    { label: 'レベル',          value: 'Lv.' + me.level, icon: '⭐' },
  ].map(c => `
    <div class="db-stat-card">
      <span class="db-stat-icon">${c.icon}</span>
      <div>
        <div class="db-stat-value">${c.value}</div>
        <div class="db-stat-label">${c.label}</div>
      </div>
    </div>
  `).join('');

  const xpWrap = document.getElementById('home-xp-wrap');
  document.getElementById('home-xp-level').textContent = `Lv.${me.level}`;
  document.getElementById('home-xp-streak').textContent = `🔥 ${me.streak}日連続`;

  const xpRes = await fetch(`${API}/calendar/xp`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (xpRes.ok) {
    const xp = await xpRes.json();
    const range = xp.next_level_xp - xp.current_level_xp;
    const progress = xp.xp - xp.current_level_xp;
    const pct = range > 0 ? Math.min(100, Math.round(progress / range * 100)) : 100;
    document.getElementById('home-xp-bar').style.width = pct + '%';
    document.getElementById('home-xp-label').textContent = `${xp.xp} / ${xp.next_level_xp} XP`;
  }

  const ctx1 = document.getElementById('home-chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: me.post_trend.map(d => d.date),
      datasets: [{
        label: '投稿数',
        data: me.post_trend.map(d => d.count),
        borderColor: CHART_DEFAULTS.accent,
        backgroundColor: 'rgba(91,110,245,0.12)',
        borderWidth: 2,
        pointBackgroundColor: CHART_DEFAULTS.accent2,
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: chartOptions(),
  });

  // XPランキング廃止
}

function chartOptions() {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: CHART_DEFAULTS.color, font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: CHART_DEFAULTS.color }, grid: { color: CHART_DEFAULTS.gridColor } },
      y: { ticks: { color: CHART_DEFAULTS.color, stepSize: 1 }, grid: { color: CHART_DEFAULTS.gridColor } },
    },
  };
}

async function loadTodayEvents() {
  const res = await fetch(`${API}/calendar/events`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('home-today-events');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const events = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const items = events.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  const TYPE_ICONS = { memo:'📝', schedule:'📅', exam:'⚠️', deadline:'🔴', event:'🎉' };
  if (items.length === 0) { el.innerHTML = '<p class="db-empty">予定なし</p>'; return; }
  el.innerHTML = items.map(e => `
    <div class="db-list-item">
      <span>${TYPE_ICONS[e.type] || '📌'}</span>
      <span class="db-list-text">${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>
  `).join('');
}

async function loadTodayTimetable() {
  const res = await fetch(`${API}/timetable/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('home-today-tt');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const all = await res.json();
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

init();

async function loadFortune() {
  try {
    const res = await fetch(`${API}/users/fortune/today`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const f = await res.json();

    const box = document.getElementById('fortune-box');
    const rankEl = document.getElementById('fortune-rank');
    const msgEl = document.getElementById('fortune-msg');
    const xpEl = document.getElementById('fortune-xp');

    rankEl.textContent = `${f.emoji} ${f.rank}`;
    msgEl.textContent = f.msg;

    if (f.xp_gained > 0) {
      xpEl.textContent = `+${f.xp_gained} XP 獲得！`;
      xpEl.style.display = 'block';
    } else if (f.already_gained) {
      xpEl.textContent = '（本日のXPは取得済み）';
      xpEl.style.display = 'block';
    }

    // レアリティに応じた色
    const colors = {
      '大吉': '#f5a623', '中吉': '#3ecf8e', '小吉': '#41b4f5',
      '吉': '#8892b0', '末吉': '#b899c0', '凶': '#f0476c', '大凶': '#b06ef5'
    };
    rankEl.style.color = colors[f.rank] || 'var(--text)';
    box.style.display = 'block';
  } catch(e) {}
}
