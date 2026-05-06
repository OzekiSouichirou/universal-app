let currentUser    = null;
let allEvents      = [];
let selectedDate   = null;
let editingEventId = null;
let currentYear, currentMonth;

document.getElementById('logout-btn').addEventListener('click', logout);

const TYPE_LABELS = {
  memo:     '📝 メモ',
  schedule: '📅 予定',
  exam:     '⚠️ 試験',
  deadline: '🔴 締め切り',
  event:    '🎉 イベント',
};

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;
  const now = new Date();
  currentYear  = now.getFullYear();
  currentMonth = now.getMonth();
  selectedDate = dateStr(now);
  await Promise.all([loadEvents(), loadXP()]);
  renderCalendar();
  renderDayEvents(selectedDate);
  checkReminders();
  document.getElementById('prev-month').addEventListener('click', () => {
    if (--currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function loadEvents() {
  allEvents = await api('/calendar/').catch(() => []);
}

async function loadXP() {
  const xp = await api('/calendar/xp').catch(() => null);
  if (xp) renderXP(xp);
}

function renderXP(xp) {
  document.getElementById('xp-level').textContent  = `Lv.${xp.level}`;
  document.getElementById('xp-streak').textContent = `🔥 ${xp.streak}日`;
  const range = xp.next_level_xp - xp.current_level_xp;
  const pct   = range > 0 ? Math.min(100, Math.round((xp.xp - xp.current_level_xp) / range * 100)) : 100;
  document.getElementById('xp-bar').style.width   = pct + '%';
  document.getElementById('xp-label').textContent = `${xp.xp} / ${xp.next_level_xp} XP`;
  if (xp.xp_gained_today > 0) xpToast(xp.xp_gained_today, 'ログインボーナス');
}

function xpToast(amount, label = '') {
  const t = document.createElement('div');
  t.className  = 'xp-toast';
  t.textContent = `+${amount} XP${label ? `（${label}）` : ''}`;
  document.getElementById('xp-card').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function renderCalendar() {
  document.getElementById('month-label').textContent = `${currentYear}年 ${currentMonth + 1}月`;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  ['日','月','火','水','木','金','土'].forEach((d, i) => {
    const el = document.createElement('div');
    el.className  = 'cal-day-name' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '');
    el.textContent = d;
    grid.appendChild(el);
  });
  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today       = dateStr(new Date());
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-cell empty';
    grid.appendChild(el);
  }
  const eventMap = {};
  allEvents.forEach(e => {
    if (!eventMap[e.date]) eventMap[e.date] = [];
    eventMap[e.date].push(e);
  });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow = new Date(currentYear, currentMonth, d).getDay();
    const el  = document.createElement('div');
    let cls   = 'cal-cell';
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';
    if (ds === today)        cls += ' today';
    if (ds === selectedDate) cls += ' selected';
    el.className = cls;
    const num = document.createElement('span');
    num.className  = 'cal-date-num';
    num.textContent = d;
    el.appendChild(num);
    if (eventMap[ds]) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      eventMap[ds].slice(0, 3).forEach(ev => {
        const dot = document.createElement('span');
        dot.className = `cal-dot type-${ev.type}${ev.is_done ? ' done' : ''}`;
        dots.appendChild(dot);
      });
      el.appendChild(dots);
    }
    el.addEventListener('click', () => {
      selectedDate = ds;
      renderCalendar();
      renderDayEvents(ds);
    });
    grid.appendChild(el);
  }
  renderExamCountdown();
}

function renderExamCountdown() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exams = allEvents
    .filter(e => e.type === 'exam' && !e.is_done)
    .map(e => ({ ...e, diff: Math.ceil((new Date(e.date) - today) / 86400000) }))
    .filter(e => e.diff >= 0)
    .sort((a, b) => a.diff - b.diff);
  const box = document.getElementById('exam-countdown');
  if (!exams.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="exam-box"><div class="exam-box-title">⚠️ 試験週間モード</div>
    ${exams.slice(0, 3).map(e => `<div class="exam-item"><span class="exam-name">${e.title}</span>
    <span class="exam-days ${e.diff <= 3 ? 'urgent' : ''}">残り ${e.diff} 日</span></div>`).join('')}</div>`;
}

function renderDayEvents(ds) {
  const today = dateStr(new Date());
  document.getElementById('selected-date-label').textContent = ds === today ? '今日の予定' : `${ds} の予定`;
  const events = allEvents.filter(e => e.date === ds);
  const list   = document.getElementById('event-list');
  if (!events.length) {
    list.innerHTML = '<p class="no-events">予定はありません</p>';
    return;
  }
  list.innerHTML = events.map(e => `
    <div class="event-item type-${e.type} ${e.is_done ? 'done' : ''}" data-id="${e.id}">
      <div class="event-item-main">
        <span class="event-type-badge type-${e.type}">${TYPE_LABELS[e.type]}</span>
        <span class="event-title">${e.title}</span>
      </div>
      ${e.memo ? `<div class="event-memo">${e.memo}</div>` : ''}
      <div class="event-actions">
        <button class="ev-done-btn ${e.is_done ? 'is-done' : ''}" data-id="${e.id}">${e.is_done ? '✓ 完了' : '完了にする'}</button>
        <button class="ev-edit-btn" data-id="${e.id}">編集</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.ev-done-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const ev = allEvents.find(e => e.id === id);
      if (!ev) return;
      try {
        const data = await api(`/calendar/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: ev.title, memo: ev.memo, date: ev.date, type: ev.type, is_done: !ev.is_done }),
        });
        ev.is_done = data.is_done;
        if (data.xp_gained > 0) xpToast(data.xp_gained);
        renderXP({ xp: data.total_xp, level: data.level, streak: 0, xp_gained_today: 0, current_level_xp: 0, next_level_xp: 100 });
        renderDayEvents(selectedDate);
        renderCalendar();
      } catch(e) { console.warn('done error:', e); }
    });
  });
  list.querySelectorAll('.ev-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(selectedDate, parseInt(btn.dataset.id)));
  });
}

function openModal(ds, editId = null) {
  editingEventId = editId;
  document.getElementById('ev-msg').textContent = '';
  if (editId) {
    const ev = allEvents.find(e => e.id === editId);
    document.getElementById('modal-title').textContent    = 'イベントを編集';
    document.getElementById('ev-title').value             = ev.title;
    document.getElementById('ev-type').value              = ev.type;
    document.getElementById('ev-date').value              = ev.date;
    document.getElementById('ev-memo').value              = ev.memo || '';
    document.getElementById('ev-delete-btn').style.display = 'inline-block';
  } else {
    document.getElementById('modal-title').textContent    = 'イベントを追加';
    document.getElementById('ev-title').value             = '';
    document.getElementById('ev-type').value              = 'memo';
    document.getElementById('ev-date').value              = ds;
    document.getElementById('ev-memo').value              = '';
    document.getElementById('ev-delete-btn').style.display = 'none';
  }
  document.getElementById('event-modal').classList.remove('hidden');
}

document.getElementById('add-event-btn').addEventListener('click', () => openModal(selectedDate));
document.getElementById('ev-cancel-btn').addEventListener('click', () => {
  document.getElementById('event-modal').classList.add('hidden');
});

document.getElementById('ev-save-btn').addEventListener('click', async () => {
  const title = document.getElementById('ev-title').value.trim();
  const type  = document.getElementById('ev-type').value;
  const date  = document.getElementById('ev-date').value;
  const memo  = document.getElementById('ev-memo').value.trim();
  const msg   = document.getElementById('ev-msg');
  if (!title) { msg.textContent = 'タイトルを入力してください'; return; }
  if (!date)  { msg.textContent = '日付を選択してください'; return; }
  try {
    if (editingEventId) {
      const ev   = allEvents.find(e => e.id === editingEventId);
      const data = await api(`/calendar/${editingEventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, memo, date, type, is_done: ev.is_done }),
      });
      const idx = allEvents.findIndex(e => e.id === editingEventId);
      allEvents[idx] = { id: data.id, title: data.title, memo: data.memo, date: data.date, type: data.type, is_done: data.is_done };
    } else {
      const data = await api('/calendar/', { method: 'POST', body: JSON.stringify({ title, memo, date, type }) });
      allEvents.push({ id: data.id, title: data.title, memo: data.memo, date: data.date, type: data.type, is_done: data.is_done });
      if (data.xp_gained > 0) xpToast(data.xp_gained);
      localStorage.setItem('polonix_calendar_today', new Date().toISOString().slice(0, 10));
    }
    selectedDate = date;
    document.getElementById('event-modal').classList.add('hidden');
    renderCalendar();
    renderDayEvents(selectedDate);
  } catch(e) { msg.textContent = e.message || '保存に失敗しました'; }
});

document.getElementById('ev-delete-btn').addEventListener('click', async () => {
  if (!confirm('このイベントを削除しますか？')) return;
  try {
    await api(`/calendar/${editingEventId}`, { method: 'DELETE' });
    allEvents = allEvents.filter(e => e.id !== editingEventId);
    document.getElementById('event-modal').classList.add('hidden');
    renderCalendar();
    renderDayEvents(selectedDate);
  } catch(e) { console.warn('delete error:', e); }
});

function checkReminders() {
  const today    = dateStr(new Date());
  const tomorrow = dateStr(new Date(Date.now() + 86400000));
  if (sessionStorage.getItem('remind_shown') === today) return;
  const items = allEvents.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  if (!items.length) return;
  sessionStorage.setItem('remind_shown', today);
  document.getElementById('remind-list').innerHTML = items.map(e => `
    <div class="remind-item">
      <span class="event-type-badge type-${e.type}">${TYPE_LABELS[e.type]}</span>
      <span>${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>`).join('');
  document.getElementById('remind-modal').classList.remove('hidden');
}

document.getElementById('remind-close-btn').addEventListener('click', () => {
  document.getElementById('remind-modal').classList.add('hidden');
});

init();
