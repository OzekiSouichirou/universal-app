const DAYS    = ['月','火','水','木','金','土'];
const PERIODS = 6;
const COLORS  = ['#5b6ef5','#3ecf8e','#f0476c','#41b4f5','#f5a623','#b06ef5','#f56e6e','#6ef5c3'];
let timetableData = {};
let editingCell   = null;

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await load();
  renderTable(); renderTodayBanner();
}

async function load() {
  const data = await api('/timetable/').catch(() => []);
  timetableData = {};
  (Array.isArray(data) ? data : []).forEach(e => { timetableData[`${e.day}-${e.period}`] = e; });
}

function renderTable() {
  const tbody = document.getElementById('tt-body');
  tbody.innerHTML = '';
  for (let p = 1; p <= PERIODS; p++) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'tt-period-col'; th.textContent = `${p}限`; tr.appendChild(th);
    for (let d = 0; d < 6; d++) {
      const td    = document.createElement('td');
      const entry = timetableData[`${d}-${p}`];
      if (entry) {
        td.className = 'tt-cell filled'; td.style.borderTop = `3px solid ${entry.color}`;
        td.innerHTML = `<div class="tt-subject">${entry.subject}</div>
          ${entry.room    ? `<div class="tt-sub-info">📍 ${entry.room}</div>` : ''}
          ${entry.teacher ? `<div class="tt-sub-info">👤 ${entry.teacher}</div>` : ''}`;
      } else {
        td.className = 'tt-cell empty'; td.innerHTML = '<span class="tt-empty-plus">＋</span>';
      }
      td.addEventListener('click', () => openModal(d, p, entry || null));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderTodayBanner() {
  const dow    = new Date().getDay();
  const dayIdx = dow===0 ? -1 : dow-1;
  const banner = document.getElementById('tt-today-banner');
  if (dayIdx<0||dayIdx>5) { banner.style.display='none'; return; }
  const items = [];
  for (let p=1; p<=PERIODS; p++) {
    const e = timetableData[`${dayIdx}-${p}`];
    if (e) items.push(`${p}限：${e.subject}${e.room?' / '+e.room:''}`);
  }
  if (!items.length) { banner.style.display='none'; return; }
  banner.style.display = 'block';
  banner.innerHTML = `<span class="tt-today-label">今日（${DAYS[dayIdx]}）</span>${items.join('　')}`;
}

function openModal(day, period, entry) {
  editingCell = { day, period, entry };
  document.getElementById('tt-modal-title').textContent = `${DAYS[day]}曜 ${period}限`;
  document.getElementById('tt-subject').value  = entry ? entry.subject : '';
  document.getElementById('tt-room').value     = entry ? (entry.room||'') : '';
  document.getElementById('tt-teacher').value  = entry ? (entry.teacher||'') : '';
  document.getElementById('tt-memo').value     = entry ? (entry.memo||'') : '';
  document.getElementById('tt-delete-btn').style.display = entry ? 'inline-block' : 'none';
  const opts = document.getElementById('tt-color-options');
  opts.innerHTML = '';
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'tt-color-btn' + (entry ? (entry.color===c?' selected':'') : (c===COLORS[0]?' selected':''));
    btn.style.background = c; btn.dataset.color = c;
    btn.addEventListener('click', () => {
      opts.querySelectorAll('.tt-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    opts.appendChild(btn);
  });
  document.getElementById('tt-modal').classList.remove('hidden');
}

document.getElementById('tt-cancel-btn').addEventListener('click', () => {
  document.getElementById('tt-modal').classList.add('hidden');
});

document.getElementById('tt-save-btn').addEventListener('click', async () => {
  const subject = document.getElementById('tt-subject').value.trim();
  if (!subject) { document.getElementById('tt-subject').focus(); return; }
  const { day, period } = editingCell;
  const color = document.getElementById('tt-color-options').querySelector('.selected')?.dataset.color || COLORS[0];
  try {
    const data = await api('/timetable/', { method:'POST', body:JSON.stringify({
      day, period, subject,
      room:    document.getElementById('tt-room').value.trim(),
      teacher: document.getElementById('tt-teacher').value.trim(),
      memo:    document.getElementById('tt-memo').value.trim(),
      color,
    })});
    timetableData[`${day}-${period}`] = data;
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable(); renderTodayBanner();
  } catch(e) { console.warn('save error:', e); }
});

document.getElementById('tt-delete-btn').addEventListener('click', async () => {
  const entry = editingCell.entry;
  if (!entry) return;
  try {
    await api(`/timetable/${entry.id}`, { method:'DELETE' });
    delete timetableData[`${editingCell.day}-${editingCell.period}`];
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable(); renderTodayBanner();
  } catch(e) { console.warn('delete error:', e); }
});

init();
