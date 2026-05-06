let chartTrend = null, chartXP = null, chartHourly = null, chartActivity = null;

function chartTheme() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    color:     light ? '#4a5580' : '#e4e9f7',
    gridColor: light ? '#d5d9ec' : '#1e2640',
    accent:    '#5b6ef5',
    accent2:   '#7b8cf7',
    green:     '#3ecf8e',
    red:       '#f0476c',
    blue:      '#41b4f5',
  };
}

document.getElementById('logout-btn').addEventListener('click', logout);

function chartOptions() {
  const CHART = chartTheme();
  return {
    responsive: true,
    plugins: { legend: { labels: { color: CHART.color, font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: CHART.color }, grid: { color: CHART.gridColor } },
      y: { ticks: { color: CHART.color, stepSize: 1 }, grid: { color: CHART.gridColor } },
    },
  };
}

function renderStatCards(cards) {
  document.getElementById('stat-cards').innerHTML = cards.map(c => `
    <div class="db-stat-card">
      <span class="db-stat-icon">${c.icon}</span>
      <div><div class="db-stat-value">${c.value}</div><div class="db-stat-label">${c.label}</div></div>
    </div>`).join('');
}

function renderTrendChart(data, label) {
  const ctx = document.getElementById('chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels:   data.map(d => d.date),
      datasets: [{
        label,
        data:                data.map(d => d.count),
        borderColor:         CHART.accent,
        backgroundColor:     'rgba(91,110,245,0.12)',
        borderWidth:         2,
        pointBackgroundColor: CHART.accent2,
        pointRadius:         4,
        tension:             0.4,
        fill:                true,
      }],
    },
    options: chartOptions(),
  });
}

function renderXPChart(ranking) {
  if (!ranking?.length) {
    const el = document.getElementById('xp-chart-card');
    if (el) el.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:24px;">データなし</p>';
    return;
  }
  const ctx = document.getElementById('chart-xp').getContext('2d');
  if (chartXP) chartXP.destroy();
  chartXP = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   ranking.map(r => r.username),
      datasets: [{
        label:           'XP',
        data:            ranking.map(r => r.xp),
        backgroundColor: ['#f5a623','#c0c0c0','#cd7f32', CHART.accent, CHART.blue],
        borderRadius:    6,
      }],
    },
    options: { ...chartOptions(), indexAxis: 'y' },
  });
}

function renderHourlyChart(data) {
  const ctx = document.getElementById('chart-hourly').getContext('2d');
  if (chartHourly) chartHourly.destroy();
  chartHourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   data.map(d => d.hour + '時'),
      datasets: [{
        label:           '投稿数',
        data:            data.map(d => d.count),
        backgroundColor: CHART.green + 'cc',
        borderRadius:    4,
      }],
    },
    options: chartOptions(),
  });
}

function renderActivityChart(data, label) {
  const card = document.getElementById('activity-card');
  if (!card) return;
  card.style.display = 'block';
  const ctx = document.getElementById('activity-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartActivity) chartActivity.destroy();
  chartActivity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   data.map(d => d.date),
      datasets: [{
        label,
        data:            data.map(d => d.count),
        backgroundColor: 'rgba(91,110,245,0.6)',
        borderRadius:    3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, ticks: { color: chartTheme().color }, grid: { color: chartTheme().gridColor } },
        x: { ticks: { color: chartTheme().color, maxTicksLimit: 10 }, grid: { display: false } },
      },
    },
  });
}

async function loadStats(user) {
  try {
    if (user.role === 'admin') {
      const [admin] = await Promise.all([api('/stats/admin'), api('/stats/me')]);
      renderStatCards([
        { label: '総ユーザー数',  value: admin.total_users,                               icon: '#' },
        { label: '総投稿数',      value: admin.total_posts,                               icon: '+' },
        { label: '総コメント数',  value: admin.total_comments,                            icon: '#' },
        { label: '総いいね数',    value: admin.total_likes,                               icon: '♡' },
        { label: '成績記録数',    value: admin.total_grades ?? 0,                         icon: '+' },
        { label: '課題数/超過',   value: `${admin.total_tasks ?? 0}/${admin.overdue_tasks ?? 0}`, icon: '#' },
      ]);
      renderTrendChart(admin.post_trend, '全体の投稿数');
      renderXPChart(admin.xp_ranking || []);
      renderHourlyChart(admin.hourly_posts || []);
      if (admin.activity) renderActivityChart(admin.activity, 'アクティブユーザー数（30日）');
      document.getElementById('hourly-card').style.display = 'block';
    } else {
      const me = await api('/stats/me');
      renderStatCards([
        { label: '自分の投稿数',    value: me.my_posts,                  icon: '+' },
        { label: '受け取ったいいね', value: me.my_likes,                  icon: '♡' },
        { label: 'レベル/XP',      value: `Lv.${me.level}/${me.xp}`,    icon: 'Lv' },
        { label: '連続ログイン',    value: me.streak + '日',             icon: '+' },
        { label: '成績記録数',      value: me.my_grades ?? 0,            icon: '+' },
        { label: '未完了課題',      value: me.my_tasks  ?? 0,            icon: '#' },
      ]);
      renderTrendChart(me.post_trend, '自分の投稿数');
      renderXPChart([]);
      document.getElementById('hourly-card').style.display = 'none';
    }
  } catch(e) { console.error('loadStats error:', e); }
}

async function loadTodayEvents() {
  const el     = document.getElementById('db-today-events');
  const events = await api('/calendar/').catch(() => null);
  if (!events) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const items    = events.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  const TYPE_ICONS = { memo: '', schedule: '', exam: '', deadline: '', event: '' };
  if (!items.length) { el.innerHTML = '<p class="db-empty">予定なし</p>'; return; }
  el.innerHTML = items.map(e => `
    <div class="db-list-item">
      <span>${TYPE_ICONS[e.type] || ''}</span>
      <span class="db-list-text">${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>`).join('');
}

async function loadTodayTimetable() {
  const el  = document.getElementById('db-today-tt');
  const all = await api('/timetable/').catch(() => null);
  if (!all) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const dow    = new Date().getDay();
  const dayIdx = dow === 0 ? -1 : dow - 1;
  if (dayIdx < 0) { el.innerHTML = '<p class="db-empty">今日は日曜日</p>'; return; }
  const PERIOD_HOURS = [9, 10, 12, 14, 15, 16];
  const nowHour      = new Date().getHours();
  const entries      = all.filter(e => e.day === dayIdx).sort((a, b) => a.period - b.period);
  if (!entries.length) { el.innerHTML = '<p class="db-empty">今日の授業なし</p>'; return; }
  el.innerHTML = entries.map(e => {
    const cur = PERIOD_HOURS[e.period - 1] !== undefined &&
      nowHour >= PERIOD_HOURS[e.period - 1] && nowHour < (PERIOD_HOURS[e.period - 1] + 2);
    return `<div class="db-list-item ${cur ? 'db-tt-now' : ''}">
      <span class="db-tt-period">${e.period}限</span>
      <span class="db-list-text" style="color:${e.color}">${e.subject}</span>
      ${e.room ? `<span class="db-tt-room">${e.room}</span>` : ''}
    </div>`;
  }).join('');
}

async function checkServer() {
  const dot   = document.getElementById('db-server-dot');
  const label = document.getElementById('db-server-label');
  const ms    = document.getElementById('db-server-ms');
  try {
    const start   = Date.now();
    const res     = await fetch(`${API}/`, { cache: 'no-store' });
    const elapsed = Date.now() - start;
    if (res.ok) {
      dot.className    = 'server-dot online';
      label.textContent = 'オンライン';
      ms.textContent   = elapsed + 'ms';
    } else {
      dot.className    = 'server-dot offline';
      label.textContent = `エラー (${res.status})`;
    }
  } catch {
    dot.className    = 'server-dot offline';
    label.textContent = 'オフライン';
  }
}

async function init() {
  const user = await checkAuth(true);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await Promise.all([loadStats(user), loadTodayEvents(), loadTodayTimetable(), checkServer()]);
}

init();
