if (typeof parseResponse === 'undefined') {
  window.parseResponse = function(json, fb) {
    if (json && json.success === true) return json.data;
    if (json && json.success === false) return fb;
    return json != null ? json : fb;
  };
}
const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
let currentUser = null;
let allEvents = [];
let selectedDate = null;
let editingEventId = null;
let currentYear, currentMonth;

document.getElementById('logout-btn').addEventListener('click', logout);

const TYPE_LABELS = { memo:'📝 メモ', schedule:'📅 予定', exam:'⚠️ 試験', deadline:'🔴 締め切り', event:'🎉 イベント' };

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  currentUser = user;
  document.getElementById('current-user').textContent = user.username;

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  selectedDate = toDateStr(now);

  await Promise.all([fetchEvents(), fetchXP()]);
  renderCalendar();
  renderDayEvents(selectedDate);
  checkReminders();

  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchEvents() {
  const res = await fetch(`${API}/calendar/`, { headers: { 'Authorization': `Bearer ${token}` } });
  const evR2 = res.ok ? await res.json() : null;
  allEvents = parseResponse(evR2, []);
}

async function fetchXP() {
  const res = await fetch(`${API}/calendar/xp`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return;
  const _raw1 = await res.json();
  const xpR = parseResponse(_raw1, {});
  const xp = parseResponse(xpR, {});
  renderXP(xp);
}

function renderXP(xp) {
  document.getElementById('xp-level').textContent = `Lv.${xp.level}`;
  document.getElementById('xp-streak').textContent = `🔥 ${xp.streak}日`;
  const range = xp.next_level_xp - xp.current_level_xp;
  const progress = xp.xp - xp.current_level_xp;
  const pct = range > 0 ? Math.min(100, Math.round(progress / range * 100)) : 100;
  document.getElementById('xp-bar').style.width = pct + '%';
  document.getElementById('xp-label').textContent = `${xp.xp} / ${xp.next_level_xp} XP`;
  if (xp.xp_gained_today > 0) {
    const card = document.getElementById('xp-card');
    const toast = document.createElement('div');
    toast.className = 'xp-toast';
    toast.textContent = `+${xp.xp_gained_today} XP（ログインボーナス）`;
    card.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

function renderCalendar() {
  const label = document.getElementById('month-label');
  label.textContent = `${currentYear}年 ${currentMonth + 1}月`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const dayNames = ['日','月','火','水','木','金','土'];
  dayNames.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'cal-day-name' + (i===0?' sun':i===6?' sat':'');
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = toDateStr(new Date());

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
    const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    const dow = new Date(currentYear, currentMonth, d).getDay();
    let cls = 'cal-cell';
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';
    if (dateStr === today) cls += ' today';
    if (dateStr === selectedDate) cls += ' selected';
    el.className = cls;

    const num = document.createElement('span');
    num.className = 'cal-date-num';
    num.textContent = d;
    el.appendChild(num);

    if (eventMap[dateStr]) {
      const dots = document.createElement('div');
      dots.className = 'cal-dots';
      eventMap[dateStr].slice(0, 3).forEach(ev => {
        const dot = document.createElement('span');
        dot.className = `cal-dot type-${ev.type}${ev.is_done ? ' done' : ''}`;
        dots.appendChild(dot);
      });
      el.appendChild(dots);
    }

    el.addEventListener('click', () => {
      selectedDate = dateStr;
      renderCalendar();
      renderDayEvents(dateStr);
    });
    grid.appendChild(el);
  }

  renderExamCountdown();
}

function renderExamCountdown() {
  const today = new Date(); today.setHours(0,0,0,0);
  const exams = allEvents
    .filter(e => e.type === 'exam' && !e.is_done)
    .map(e => ({ ...e, diff: Math.ceil((new Date(e.date) - today) / 86400000) }))
    .filter(e => e.diff >= 0)
    .sort((a, b) => a.diff - b.diff);

  const box = document.getElementById('exam-countdown');
  if (exams.length === 0) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <div class="exam-box">
      <div class="exam-box-title">⚠️ 試験週間モード</div>
      ${exams.slice(0, 3).map(e => `
        <div class="exam-item">
          <span class="exam-name">${e.title}</span>
          <span class="exam-days ${e.diff <= 3 ? 'urgent' : ''}">残り ${e.diff} 日</span>
        </div>
      `).join('')}
    </div>`;
}

function renderDayEvents(dateStr) {
  const label = document.getElementById('selected-date-label');
  const today = toDateStr(new Date());
  label.textContent = dateStr === today ? '今日の予定' : `${dateStr} の予定`;

  const events = allEvents.filter(e => e.date === dateStr);
  const list = document.getElementById('event-list');

  if (events.length === 0) {
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
    </div>
  `).join('');

  list.querySelectorAll('.ev-done-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const ev = allEvents.find(e => e.id === id);
      if (!ev) return;
      const res = await fetch(`${API}/calendar/${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ev.title, memo: ev.memo, date: ev.date, type: ev.type, is_done: !ev.is_done })
      });
      if (res.ok) {
        const _raw2 = await res.json();
        const data = parseResponse(_raw2, {});
        ev.is_done = data.is_done;
        if (data.xp_gained > 0) showXPToast(data.xp_gained);
        renderXP({ xp: data.total_xp, level: data.level, streak: 0, xp_gained_today: 0,
          current_level_xp: 0, next_level_xp: 100 });
        renderDayEvents(selectedDate);
        renderCalendar();
      }
    });
  });

  list.querySelectorAll('.ev-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      openModal(selectedDate, id);
    });
  });
}

function showXPToast(amount) {
  const toast = document.createElement('div');
  toast.className = 'xp-toast';
  toast.textContent = `+${amount} XP`;
  document.getElementById('xp-card').appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function openModal(dateStr, editId = null) {
  editingEventId = editId;
  const modal = document.getElementById('event-modal');
  document.getElementById('ev-msg').textContent = '';

  if (editId) {
    const ev = allEvents.find(e => e.id === editId);
    document.getElementById('modal-title').textContent = 'イベントを編集';
    document.getElementById('ev-title').value = ev.title;
    document.getElementById('ev-type').value = ev.type;
    document.getElementById('ev-date').value = ev.date;
    document.getElementById('ev-memo').value = ev.memo || '';
    document.getElementById('ev-delete-btn').style.display = 'inline-block';
  } else {
    document.getElementById('modal-title').textContent = 'イベントを追加';
    document.getElementById('ev-title').value = '';
    document.getElementById('ev-type').value = 'memo';
    document.getElementById('ev-date').value = dateStr;
    document.getElementById('ev-memo').value = '';
    document.getElementById('ev-delete-btn').style.display = 'none';
  }
  modal.classList.remove('hidden');
}

document.getElementById('add-event-btn').addEventListener('click', () => openModal(selectedDate));

document.getElementById('ev-cancel-btn').addEventListener('click', () => {
  document.getElementById('event-modal').classList.add('hidden');
});

document.getElementById('ev-save-btn').addEventListener('click', async () => {
  const title = document.getElementById('ev-title').value.trim();
  const type = document.getElementById('ev-type').value;
  const date = document.getElementById('ev-date').value;
  const memo = document.getElementById('ev-memo').value.trim();
  const msg = document.getElementById('ev-msg');

  if (!title) { msg.textContent = 'タイトルを入力してください'; return; }
  if (!date) { msg.textContent = '日付を選択してください'; return; }

  if (editingEventId) {
    const ev = allEvents.find(e => e.id === editingEventId);
    const res = await fetch(`${API}/calendar/${editingEventId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, memo, date, type, is_done: ev.is_done })
    });
    if (res.ok) {
      const _raw3 = await res.json();
      const data = parseResponse(_raw3, {});
      const idx = allEvents.findIndex(e => e.id === editingEventId);
      allEvents[idx] = { id: data.id, title: data.title, memo: data.memo, date: data.date, type: data.type, is_done: data.is_done };
      selectedDate = date;
    }
  } else {
    const res = await fetch(`${API}/calendar/`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, memo, date, type })
    });
    if (res.ok) {
      const _raw4 = await res.json();
      const data = parseResponse(_raw4, {});
      allEvents.push({ id: data.id, title: data.title, memo: data.memo, date: data.date, type: data.type, is_done: data.is_done });
      if (data.xp_gained > 0) showXPToast(data.xp_gained);
      selectedDate = date;
    }
  }
  document.getElementById('event-modal').classList.add('hidden');
  renderCalendar();
  renderDayEvents(selectedDate);
});

document.getElementById('ev-delete-btn').addEventListener('click', async () => {
  if (!confirm('このイベントを削除しますか？')) return;
  const res = await fetch(`${API}/calendar/${editingEventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    allEvents = allEvents.filter(e => e.id !== editingEventId);
    document.getElementById('event-modal').classList.add('hidden');
    renderCalendar();
    renderDayEvents(selectedDate);
  }
});

function checkReminders() {
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));
  const reminders = allEvents.filter(e => (e.date === today || e.date === tomorrow) && !e.is_done);
  if (reminders.length === 0) return;

  const list = document.getElementById('remind-list');
  list.innerHTML = reminders.map(e => `
    <div class="remind-item">
      <span class="event-type-badge type-${e.type}">${TYPE_LABELS[e.type]}</span>
      <span>${e.date === today ? '今日' : '明日'}：${e.title}</span>
    </div>
  `).join('');
  document.getElementById('remind-modal').classList.remove('hidden');
}

document.getElementById('remind-close-btn').addEventListener('click', () => {
  document.getElementById('remind-modal').classList.add('hidden');
});

init();
