document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) {
    if (token()) await loadNotices().catch(() => {});
    return;
  }
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('welcome-msg').textContent = `ようこそ、${user.username} さん`;
  await Promise.all([loadNotices(), loadStats(), loadTodayEvents(), loadTodayTimetable(), loadFortune(), loadMissions(), loadExamCountdown()]);
}

async function loadNotices() {
  const notices = await api('/notices/').catch(() => []);
  const list = document.getElementById('notice-list');
  if (!notices?.length) { list.innerHTML = '<li class="notice-item">現在お知らせはありません</li>'; return; }
  list.innerHTML = notices.map(n => `<li class="notice-item"><strong>${n.title}</strong><p>${n.content}</p></li>`).join('');
}

async function loadStats() {
  try {
    const me = await api('/stats/me');
    document.getElementById('home-stat-cards').innerHTML = [
      { label: '自分の投稿数',     value: me.my_posts    ?? '-', icon: '+' },
      { label: '受け取ったいいね', value: me.my_likes    ?? '-', icon: '♡' },
      { label: '自分のコメント',   value: me.my_comments ?? '-', icon: '#' },
      { label: 'レベル',          value: 'Lv.' + (me.level ?? 1), icon: 'Lv' },
    ].map(c => `
      <div class="db-stat-card">
        <span class="db-stat-icon">${c.icon}</span>
        <div><div class="db-stat-value">${c.value}</div><div class="db-stat-label">${c.label}</div></div>
      </div>`).join('');

    document.getElementById('home-xp-level').textContent  = `Lv.${me.level ?? 1}`;
    document.getElementById('home-xp-streak').textContent = `${me.streak ?? 0}日連続`;

    const xp = await api('/calendar/xp').catch(() => null);
    if (xp) {
      const range    = (xp.next_level_xp ?? 100) - (xp.current_level_xp ?? 0);
      const progress = (xp.xp ?? 0) - (xp.current_level_xp ?? 0);
      const pct      = range > 0 ? Math.min(100, Math.round(progress / range * 100)) : 100;
      document.getElementById('home-xp-bar').style.width   = pct + '%';
      document.getElementById('home-xp-label').textContent = `${xp.xp ?? 0} / ${xp.next_level_xp ?? 100} XP`;
    }
  } catch(e) { console.warn('loadStats error:', e); }
}

async function loadTodayEvents() {
  const el = document.getElementById('home-today-events');
  const events = await api('/calendar/').catch(() => null);
  if (!events) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const items    = events.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  const TYPE_ICONS = { memo:'', schedule:'', exam:'', deadline:'', event:'' };
  if (!items.length) { el.innerHTML = '<p class="db-empty">予定なし</p>'; return; }
  el.innerHTML = items.map(e => `
    <div class="db-list-item">
      <span>${TYPE_ICONS[e.type] || ''}</span>
      <span class="db-list-text">${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>`).join('');
}

async function loadTodayTimetable() {
  const el = document.getElementById('home-today-tt');
  const all = await api('/timetable/').catch(() => null);
  if (!all) { el.innerHTML = '<p class="db-empty">取得できませんでした</p>'; return; }
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

async function loadFortune() {
  try {
    const f   = await api('/users/fortune/today');
    const box = document.getElementById('fortune-box');
    if (!box) return;
    document.getElementById('fortune-rank').textContent = f.rank;
    document.getElementById('fortune-rank').style.color =
      {'大吉':'#f5a623','中吉':'#3ecf8e','小吉':'#41b4f5',
       '吉':'#8892b0','末吉':'#b899c0','凶':'#f0476c','大凶':'#b06ef5'}[f.rank] || 'var(--text)';
    document.getElementById('fortune-msg').textContent = f.msg;
    const xpEl = document.getElementById('fortune-xp');
    if (f.xp_gained > 0)       { xpEl.textContent = `+${f.xp_gained} XP`; xpEl.style.display = 'block'; }
    else if (f.already_gained) { xpEl.textContent = '本日取得済み';        xpEl.style.display = 'block'; }
    box.style.display = 'block';
  } catch(e) { console.warn('loadFortune error:', e); }
}

async function loadMissions() {
  try {
    setMission('login', true);
    const me       = await api('/stats/me').catch(() => null);
    const today    = new Date();
    const mm       = String(today.getMonth() + 1).padStart(2, '0');
    const dd       = String(today.getDate()).padStart(2, '0');
    const todayLabel = `${mm}/${dd}`;
    const todayStr   = today.toISOString().slice(0, 10);
    const entry    = me?.post_trend?.find(t => t.date === todayLabel);
    setMission('post', !!(entry?.count > 0));
    const cal = await api('/calendar/').catch(() => []); const hasCalToday = Array.isArray(cal) && cal.some(e => e.created_at && e.created_at.startsWith(todayStr)); setMission('calendar', hasCalToday);
    const grades = await api('/grades/').catch(() => []);
    setMission('grade', Array.isArray(grades) && grades.some(g => g.date === todayStr));
    const tasks = await api('/tasks/').catch(() => []);
    setMission('task', Array.isArray(tasks) && tasks.length > 0);
  } catch(e) { console.warn('loadMissions error:', e); }
}

function setMission(id, done) {
  const item   = document.getElementById(`mission-${id}`);
  const status = document.getElementById(`ms-${id}`);
  if (!item || !status) return;
  item.classList.toggle('done', done);
  status.textContent = done ? '達成済み' : '未達成';
}

async function loadExamCountdown() {
  try {
    const events = await api('/calendar/');
    const today  = new Date(); today.setHours(0,0,0,0);
    const exams  = events
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
      ${exams.length > 1 ? `<div style="font-size:11px;color:var(--text-3);margin-top:8px;">他 ${exams.length - 1} 件の試験あり</div>` : ''}`;
    grid.parentNode.insertBefore(card, grid);
  } catch(e) { console.warn('loadExamCountdown error:', e); }
}

init();

// ============================================================
// ウィジェット並べ替え（ドラッグ&ドロップ）
// ============================================================
const WIDGET_ORDER_KEY = 'polonix_widget_order';

function initWidgetSort() {
  const container = document.getElementById('widget-container');
  if (!container) return;

  // 保存済み順序を復元
  const saved = localStorage.getItem(WIDGET_ORDER_KEY);
  if (saved) {
    try {
      const order = JSON.parse(saved);
      order.forEach(id => {
        const el = container.querySelector(`[data-widget="${id}"]`);
        if (el) container.appendChild(el);
      });
    } catch(_) {}
  }

  let dragging = null;

  container.querySelectorAll('.home-widget').forEach(widget => {
    widget.addEventListener('dragstart', e => {
      dragging = widget;
      widget.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    widget.addEventListener('dragend', () => {
      widget.classList.remove('dragging');
      dragging = null;
      saveWidgetOrder();
    });
    widget.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === widget) return;
      const rect = widget.getBoundingClientRect();
      const mid  = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        container.insertBefore(dragging, widget);
      } else {
        container.insertBefore(dragging, widget.nextSibling);
      }
    });
  });

  // タッチ対応（モバイル）
  let touchTarget = null;
  let touchClone  = null;

  container.querySelectorAll('.home-widget').forEach(widget => {
    widget.addEventListener('touchstart', e => {
      touchTarget = widget;
      widget.classList.add('dragging');
    }, { passive: true });

    widget.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!touchTarget) return;
      const touch = e.touches[0];
      const els   = document.elementsFromPoint(touch.clientX, touch.clientY);
      const over  = els.find(el => el.classList.contains('home-widget') && el !== touchTarget);
      if (over) {
        const rect = over.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        if (touch.clientY < mid) container.insertBefore(touchTarget, over);
        else container.insertBefore(touchTarget, over.nextSibling);
      }
    }, { passive: false });

    widget.addEventListener('touchend', () => {
      if (touchTarget) touchTarget.classList.remove('dragging');
      touchTarget = null;
      saveWidgetOrder();
    });
  });
}

function saveWidgetOrder() {
  const container = document.getElementById('widget-container');
  if (!container) return;
  const order = [...container.querySelectorAll('.home-widget')].map(el => el.dataset.widget);
  localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
}

document.addEventListener('DOMContentLoaded', initWidgetSort);

// 通知リアルタイムポーリング（30秒）
let _lastNotifCount = 0;
async function pollNotifications() {
  try {
    const notifs = await api('/posts/notifications/list').catch(() => null);
    if (!notifs) return;
    const unread = notifs.filter(n => !n.is_read).length;
    if (unread > _lastNotifCount && _lastNotifCount >= 0) {
      const diff = unread - _lastNotifCount;
      if (diff > 0 && _lastNotifCount > 0) toast(`${diff}件の新しい通知があります`);
    }
    _lastNotifCount = unread;
  } catch(_) {}
}
setInterval(pollNotifications, 30000);
