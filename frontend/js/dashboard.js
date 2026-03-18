const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let chartTrend = null;

const CHART_DEFAULTS = {
  color: '#e4e9f7',
  gridColor: '#1e2640',
  accent: '#5b6ef5',
  accent2: '#7b8cf7',
  green: '#3ecf8e',
  red: '#f0476c',
  blue: '#41b4f5',
};

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;

  await Promise.all([
    loadStats(user),
    loadTodayEvents(),
    loadTodayTimetable(),
    checkServer(),
  ]);
}

async function loadStats(user) {
  const isAdmin = user.role === 'admin';

  if (isAdmin) {
    const [adminRes, meRes] = await Promise.all([
      fetch(`${API}/stats/admin`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`${API}/stats/me`,    { headers: { 'Authorization': `Bearer ${token}` } }),
    ]);
    const admin = await adminRes.json();
    const me = await meRes.json();

    renderStatCards([
      { label: '総ユーザー数', value: admin.total_users, icon: '👥' },
      { label: '総投稿数',    value: admin.total_posts,    icon: '📝' },
      { label: '総コメント数', value: admin.total_comments, icon: '💬' },
      { label: '総いいね数',  value: admin.total_likes,    icon: '❤️' },
      { label: '自分の投稿',  value: me.my_posts,          icon: '✏️' },
      { label: 'Lv.' + me.level + ' / ' + me.xp + 'XP', value: '🔥' + me.streak + '日', icon: '⭐' },
    ]);

    renderTrendChart(admin.post_trend, '全体の投稿数');

  } else {
    const res = await fetch(`${API}/stats/me`, { headers: { 'Authorization': `Bearer ${token}` } });
    const me = await res.json();

    renderStatCards([
      { label: '自分の投稿数',  value: me.my_posts,    icon: '✏️' },
      { label: '受け取ったいいね', value: me.my_likes, icon: '❤️' },
      { label: '自分のコメント', value: me.my_comments, icon: '💬' },
      { label: 'レベル',        value: 'Lv.' + me.level, icon: '⭐' },
      { label: 'XP',           value: me.xp,            icon: '💡' },
      { label: '連続ログイン',  value: me.streak + '日', icon: '🔥' },
    ]);

    renderTrendChart(me.post_trend, '自分の投稿数');
  }
}

function renderStatCards(cards) {
  const el = document.getElementById('stat-cards');
  el.innerHTML = cards.map(c => `
    <div class="db-stat-card">
      <span class="db-stat-icon">${c.icon}</span>
      <div>
        <div class="db-stat-value">${c.value}</div>
        <div class="db-stat-label">${c.label}</div>
      </div>
    </div>
  `).join('');
}

function renderTrendChart(data, label) {
  const ctx = document.getElementById('chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label,
        data: data.map(d => d.count),
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
}

// renderXPChart 廃止

// renderHourlyChart 廃止

function chartOptions() {
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: CHART_DEFAULTS.color, font: { size: 12 } } },
    },
    scales: {
      x: { ticks: { color: CHART_DEFAULTS.color }, grid: { color: CHART_DEFAULTS.gridColor } },
      y: { ticks: { color: CHART_DEFAULTS.color, stepSize: 1 }, grid: { color: CHART_DEFAULTS.gridColor } },
    },
  };
}

async function loadTodayEvents() {
  const res = await fetch(`${API}/calendar/events`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('db-today-events');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const events = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const items = events.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  if (items.length === 0) {
    el.innerHTML = '<p class="db-empty">予定なし</p>';
    return;
  }
  const TYPE_ICONS = { memo:'📝', schedule:'📅', exam:'⚠️', deadline:'🔴', event:'🎉' };
  el.innerHTML = items.map(e => `
    <div class="db-list-item">
      <span>${TYPE_ICONS[e.type] || '📌'}</span>
      <span class="db-list-text">${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>
  `).join('');
}

async function loadTodayTimetable() {
  const res = await fetch(`${API}/timetable/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const el = document.getElementById('db-today-tt');
  if (!res.ok) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const all = await res.json();
  const dow = new Date().getDay();
  const dayIdx = dow === 0 ? -1 : dow - 1;
  if (dayIdx < 0) { el.innerHTML = '<p class="db-empty">今日は日曜日</p>'; return; }

  const nowHour = new Date().getHours();
  const PERIOD_HOURS = [9, 10, 12, 14, 15, 16];

  const todayEntries = all
    .filter(e => e.day === dayIdx)
    .sort((a, b) => a.period - b.period);

  if (todayEntries.length === 0) { el.innerHTML = '<p class="db-empty">今日の授業なし</p>'; return; }

  el.innerHTML = todayEntries.map(e => {
    const isCurrent = PERIOD_HOURS[e.period - 1] !== undefined &&
      nowHour >= PERIOD_HOURS[e.period - 1] &&
      nowHour < (PERIOD_HOURS[e.period - 1] + 2);
    return `
      <div class="db-list-item ${isCurrent ? 'db-tt-now' : ''}">
        <span class="db-tt-period">${e.period}限</span>
        <span class="db-list-text" style="color:${e.color}">${e.subject}</span>
        ${e.room ? `<span class="db-tt-room">${e.room}</span>` : ''}
      </div>
    `;
  }).join('');
}

async function checkServer() {
  const dot = document.getElementById('db-server-dot');
  const label = document.getElementById('db-server-label');
  const ms = document.getElementById('db-server-ms');
  try {
    const start = Date.now();
    const res = await fetch(`${API}/`, { cache: 'no-store' });
    const elapsed = Date.now() - start;
    if (res.ok) {
      dot.className = 'server-dot online';
      label.textContent = 'オンライン';
      ms.textContent = elapsed + 'ms';
    } else {
      dot.className = 'server-dot offline';
      label.textContent = 'エラー (' + res.status + ')';
    }
  } catch {
    dot.className = 'server-dot offline';
    label.textContent = 'オフライン';
  }
}

init();
