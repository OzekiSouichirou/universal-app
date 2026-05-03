document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) {
    if (token()) await loadNotices().catch(() => {});
    return;
  }
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent  = `ようこそ、${user.username} さん`;

  // 全データを並列取得（重複なし）
  const [notices, me, xp, events, timetable, fortune] = await Promise.all([
    api('/notices/').catch(() => []),
    api('/stats/me').catch(() => null),
    api('/calendar/xp').catch(() => null),
    api('/calendar/').catch(() => []),
    api('/timetable/').catch(() => []),
    api('/users/fortune/today').catch(() => null),
  ]);

  renderNotices(notices);
  renderStats(me, xp);
  renderTodayEvents(events);
  renderTodayTimetable(timetable);
  renderFortune(fortune);
  renderMissions(me, events);
  renderExamCountdown(events);
}

function renderNotices(notices) {
  const list = document.getElementById('notice-list');
  if (!list) return;
  if (!notices?.length) {
    list.innerHTML = '<li class="notice-item">現在お知らせはありません</li>';
    return;
  }
  list.innerHTML = notices.map(n =>
    `<li class="notice-item"><strong>${n.title}</strong><p>${n.content}</p></li>`
  ).join('');
}

function renderStats(me, xp) {
  if (!me) return;
  const cards = document.getElementById('home-stat-cards');
  if (cards) {
    cards.innerHTML = [
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
      </div>`).join('');
  }

  const lvEl = document.getElementById('home-xp-level');
  const stEl = document.getElementById('home-xp-streak');
  if (lvEl) lvEl.textContent = `Lv.${me.level ?? 1}`;
  if (stEl) stEl.textContent = `${me.streak ?? 0}日連続`;

  if (xp) {
    const range    = (xp.next_level_xp ?? 100) - (xp.current_level_xp ?? 0);
    const progress = (xp.xp ?? 0) - (xp.current_level_xp ?? 0);
    const pct      = range > 0 ? Math.min(100, Math.round(progress / range * 100)) : 100;
    const barEl    = document.getElementById('home-xp-bar');
    const labelEl  = document.getElementById('home-xp-label');
    if (barEl)   barEl.style.width   = pct + '%';
    if (labelEl) labelEl.textContent = `${xp.xp ?? 0} / ${xp.next_level_xp ?? 100} XP`;
  }
}

function renderTodayEvents(events) {
  const el = document.getElementById('home-today-events');
  if (!el) return;
  if (!Array.isArray(events)) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
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

function renderTodayTimetable(all) {
  const el = document.getElementById('home-today-tt');
  if (!el) return;
  if (!Array.isArray(all)) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const dow    = new Date().getDay();
  const dayIdx = dow === 0 ? -1 : dow - 1;
  if (dayIdx < 0) { el.innerHTML = '<p class="db-empty">今日は日曜日</p>'; return; }
  const nowHour      = new Date().getHours();
  const PERIOD_HOURS = [9, 10, 12, 14, 15, 16];
  const entries      = all.filter(e => e.day === dayIdx).sort((a, b) => a.period - b.period);
  if (!entries.length) { el.innerHTML = '<p class="db-empty">今日の授業なし</p>'; return; }
  el.innerHTML = entries.map(e => {
    const cur = PERIOD_HOURS[e.period - 1] !== undefined &&
      nowHour >= PERIOD_HOURS[e.period - 1] && nowHour < (PERIOD_HOURS[e.period - 1] + 2);
    return `
      <div class="db-list-item ${cur ? 'db-tt-now' : ''}">
        <span class="db-tt-period">${e.period}限</span>
        <span class="db-list-text" style="color:${e.color}">${e.subject}</span>
        ${e.room ? `<span class="db-tt-room">${e.room}</span>` : ''}
      </div>`;
  }).join('');
}

function renderFortune(f) {
  if (!f) return;
  const box = document.getElementById('fortune-box');
  if (!box) return;
  const rankEl = document.getElementById('fortune-rank');
  if (rankEl) {
    rankEl.textContent = f.rank;
    rankEl.style.color = {
      '大吉': '#f5a623', '中吉': '#3ecf8e', '小吉': '#41b4f5',
      '吉': '#8892b0', '末吉': '#b899c0', '凶': '#f0476c', '大凶': '#b06ef5',
    }[f.rank] || 'var(--text)';
  }
  const msgEl = document.getElementById('fortune-msg');
  if (msgEl) msgEl.textContent = f.msg;
  const xpEl = document.getElementById('fortune-xp');
  if (xpEl) {
    if (f.xp_gained > 0)       { xpEl.textContent = `+${f.xp_gained} XP`; xpEl.style.display = 'block'; }
    else if (f.already_gained) { xpEl.textContent = '本日取得済み';         xpEl.style.display = 'block'; }
  }
  box.style.display = 'block';
}

function renderMissions(me, events) {
  setMission('login', true);
  const today     = new Date();
  const mm        = String(today.getMonth() + 1).padStart(2, '0');
  const dd        = String(today.getDate()).padStart(2, '0');
  const todayLabel = `${mm}/${dd}`;
  const todayStr   = today.toISOString().slice(0, 10);

  // 投稿ミッション（stats/me の post_trend を再利用）
  const entry = me?.post_trend?.find(t => t.date === todayLabel);
  setMission('post', !!(entry?.count > 0));

  // カレンダーミッション（取得済み events を再利用）
  const hasCalToday = Array.isArray(events) && events.some(e => e.created_at?.startsWith(todayStr));
  setMission('calendar', hasCalToday);

  // 成績・課題ミッションは別途取得（今日登録したデータかどうかなので必要）
  Promise.all([
    api('/grades/').catch(() => []),
    api('/tasks/').catch(() => []),
  ]).then(([grades, tasks]) => {
    setMission('grade', Array.isArray(grades) && grades.some(g => g.date === todayStr));
    setMission('task',  Array.isArray(tasks)  && tasks.length > 0);
  });
}

function setMission(id, done) {
  const item   = document.getElementById(`mission-${id}`);
  const status = document.getElementById(`ms-${id}`);
  if (!item || !status) return;
  item.classList.toggle('done', done);
  status.textContent = done ? '達成済み' : '未達成';
}

function renderExamCountdown(events) {
  if (!Array.isArray(events)) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exams = events
    .filter(e => e.type === 'exam' && !e.is_done)
    .map(e => ({ ...e, daysLeft: Math.ceil((new Date(e.date) - today) / 86400000) }))
    .filter(e => e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  if (!exams.length) return;
  const next  = exams[0];
  const color = next.daysLeft <= 3 ? 'var(--red)' : next.daysLeft <= 7 ? 'var(--gold, #f5a623)' : 'var(--accent)';
  const grid  = document.querySelector('.home-grid');
  if (!grid || document.getElementById('exam-countdown')) return;
  const card = document.createElement('div');
  card.className = 'db-card';
  card.id        = 'exam-countdown';
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
    ${exams.length > 1 ? `<div style="font-size:11px;color:var(--text-3);margin-top:8px;">他 ${exams.length - 1} 件の試験あり</div>` : ''}`;
  grid.parentNode.insertBefore(card, grid);
}

init();

// 通知ポーリング（30秒）
let _lastNotifCount = 0;
async function pollNotifications() {
  try {
    const notifs = await api('/posts/notifications/list').catch(() => null);
    if (!notifs) return;
    const unread = notifs.filter(n => !n.is_read).length;
    if (unread > _lastNotifCount && _lastNotifCount > 0) {
      toast(`${unread - _lastNotifCount}件の新しい通知があります`);
    }
    _lastNotifCount = unread;
  } catch (_) {}
}
setInterval(pollNotifications, 30000);
