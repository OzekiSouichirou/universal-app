if (typeof parseResponse === 'undefined') {
  window.parseResponse = function(json, fb) {
    if (json && json.success === true) return json.data;
    if (json && json.success === false) return fb;
    return json != null ? json : fb;
  };
}
const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
const DAYS = ['月','火','水','木','金','土'];
const PERIODS = 6;
const COLORS = ['#5b6ef5','#3ecf8e','#f0476c','#41b4f5','#f5a623','#b06ef5','#f56e6e','#6ef5c3'];
let timetableData = {};
let editingCell = null;

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await fetchTimetable();
  renderTable();
  renderTodayBanner();
}

async function fetchTimetable() {
  const res = await fetch(`${API}/timetable/`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return;
  const _raw1 = await res.json();
  const ttR = parseResponse(_raw1, {});
  const data = parseResponse(ttR, []);
  timetableData = {};
  data.forEach(e => { timetableData[`${e.day}-${e.period}`] = e; });
}

function renderTable() {
  const tbody = document.getElementById('tt-body');
  tbody.innerHTML = '';
  for (let p = 1; p <= PERIODS; p++) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'tt-period-col';
    th.textContent = `${p}限`;
    tr.appendChild(th);
    for (let d = 0; d < 6; d++) {
      const td = document.createElement('td');
      const entry = timetableData[`${d}-${p}`];
      if (entry) {
        td.className = 'tt-cell filled';
        td.style.borderTop = `3px solid ${entry.color}`;
        td.innerHTML = `
          <div class="tt-subject">${entry.subject}</div>
          ${entry.room ? `<div class="tt-sub-info">📍 ${entry.room}</div>` : ''}
          ${entry.teacher ? `<div class="tt-sub-info">👤 ${entry.teacher}</div>` : ''}
        `;
      } else {
        td.className = 'tt-cell empty';
        td.innerHTML = '<span class="tt-empty-plus">＋</span>';
      }
      td.addEventListener('click', () => openModal(d, p, entry || null));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderTodayBanner() {
  const dow = new Date().getDay();
  const dayIdx = dow === 0 ? -1 : dow - 1;
  const banner = document.getElementById('tt-today-banner');
  if (dayIdx < 0 || dayIdx > 5) { banner.style.display = 'none'; return; }
  const todayEntries = [];
  for (let p = 1; p <= PERIODS; p++) {
    const e = timetableData[`${dayIdx}-${p}`];
    if (e) todayEntries.push(`${p}限：${e.subject}${e.room ? ' / '+e.room : ''}`);
  }
  if (todayEntries.length === 0) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  banner.innerHTML = `<span class="tt-today-label">今日（${DAYS[dayIdx]}）</span>${todayEntries.join('　')}`;
}

function openModal(day, period, entry) {
  editingCell = { day, period, entry };
  document.getElementById('tt-modal-title').textContent = `${DAYS[day]}曜 ${period}限`;
  document.getElementById('tt-subject').value = entry ? entry.subject : '';
  document.getElementById('tt-room').value = entry ? (entry.room || '') : '';
  document.getElementById('tt-teacher').value = entry ? (entry.teacher || '') : '';
  document.getElementById('tt-memo').value = entry ? (entry.memo || '') : '';
  document.getElementById('tt-delete-btn').style.display = entry ? 'inline-block' : 'none';

  const colorOpts = document.getElementById('tt-color-options');
  colorOpts.innerHTML = '';
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'tt-color-btn' + (entry && entry.color === c ? ' selected' : (!entry && c === COLORS[0] ? ' selected' : ''));
    btn.style.background = c;
    btn.dataset.color = c;
    btn.addEventListener('click', () => {
      colorOpts.querySelectorAll('.tt-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    colorOpts.appendChild(btn);
  });

  document.getElementById('tt-modal').classList.remove('hidden');
}

document.getElementById('tt-cancel-btn').addEventListener('click', () => {
  document.getElementById('tt-modal').classList.add('hidden');
});

document.getElementById('tt-save-btn').addEventListener('click', async () => {
  const subject = document.getElementById('tt-subject').value.trim();
  if (!subject) { document.getElementById('tt-subject').focus(); return; }
  const room = document.getElementById('tt-room').value.trim();
  const teacher = document.getElementById('tt-teacher').value.trim();
  const memo = document.getElementById('tt-memo').value.trim();
  const selected = document.getElementById('tt-color-options').querySelector('.selected');
  const color = selected ? selected.dataset.color : COLORS[0];
  const { day, period } = editingCell;

  const res = await fetch(`${API}/timetable/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ day, period, subject, room, teacher, memo, color })
  });
  if (res.ok) {
    const _raw2 = await res.json();
    const data = parseResponse(_raw2, {});
    timetableData[`${day}-${period}`] = data;
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable();
    renderTodayBanner();
  }
});

document.getElementById('tt-delete-btn').addEventListener('click', async () => {
  const entry = editingCell.entry;
  if (!entry) return;
  const res = await fetch(`${API}/timetable/${entry.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    delete timetableData[`${editingCell.day}-${editingCell.period}`];
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable();
    renderTodayBanner();
  }
});

init();
