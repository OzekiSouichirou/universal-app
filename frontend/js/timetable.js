const DAYS    = ['月','火','水','木','金','土','日'];
const COLORS  = ['#5b6ef5','#3ecf8e','#f0476c','#41b4f5','#f5a623','#b06ef5','#f56e6e','#6ef5c3'];

// 設定: ローカルストレージから取得
let settings = {
  periods:  parseInt(localStorage.getItem('tt_periods')  || '6'),
  showSun:  localStorage.getItem('tt_showSun') === 'true',
};

let timetableData = {};
let editingCell   = null;

document.getElementById('logout-btn').addEventListener('click', logout);

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  applySettings();
  await load();
  renderTable();
  renderTodayBanner();
}

function applySettings() {
  document.getElementById('tt-periods-select').value = settings.periods;
  document.getElementById('tt-show-sun').checked     = settings.showSun;
}

async function load() {
  const data = await api('/timetable/').catch(() => []);
  timetableData = {};
  (Array.isArray(data) ? data : []).forEach(e => {
    timetableData[`${e.day}-${e.period}`] = e;
  });
}

function renderTable() {
  const days   = settings.showSun ? DAYS : DAYS.slice(0, 6);
  const thead  = document.getElementById('tt-thead');
  const tbody  = document.getElementById('tt-body');

  // ヘッダー
  thead.innerHTML = '<tr><th class="tt-period-col"></th>' +
    days.map(d => `<th>${d}</th>`).join('') + '</tr>';

  // ボディ
  tbody.innerHTML = '';
  for (let p = 1; p <= settings.periods; p++) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'tt-period-col';
    th.textContent = `${p}限`;
    tr.appendChild(th);

    days.forEach((_, d) => {
      const td    = document.createElement('td');
      const entry = timetableData[`${d}-${p}`];
      if (entry) {
        td.className = 'tt-cell filled';
        td.style.borderTop = `3px solid ${entry.color}`;
        td.innerHTML = `
          <div class="tt-subject">${entry.subject}</div>
          ${entry.start_time ? `<div class="tt-sub-info">🕐 ${entry.start_time}</div>` : ''}
          ${entry.room    ? `<div class="tt-sub-info">📍 ${entry.room}</div>` : ''}
          ${entry.teacher ? `<div class="tt-sub-info">👤 ${entry.teacher}</div>` : ''}`;
      } else {
        td.className = 'tt-cell empty';
        td.innerHTML = '<span class="tt-empty-plus">＋</span>';
      }
      td.addEventListener('click', () => openModal(d, p, entry || null));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function renderTodayBanner() {
  const dow    = new Date().getDay();
  const dayIdx = dow === 0 ? 6 : dow - 1;
  const banner = document.getElementById('tt-today-banner');
  if (!settings.showSun && dayIdx === 6) { banner.style.display = 'none'; return; }
  const items = [];
  for (let p = 1; p <= settings.periods; p++) {
    const e = timetableData[`${dayIdx}-${p}`];
    if (e) items.push(`${p}限：${e.subject}${e.room ? ' / ' + e.room : ''}`);
  }
  if (!items.length) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  banner.innerHTML = `<span class="tt-today-label">今日（${DAYS[dayIdx]}）</span>${items.join('　')}`;
}

function openModal(day, period, entry) {
  editingCell = { day, period, entry };
  document.getElementById('tt-modal-title').textContent = `${DAYS[day]}曜 ${period}限`;
  document.getElementById('tt-subject').value    = entry?.subject   || '';
  document.getElementById('tt-room').value       = entry?.room      || '';
  document.getElementById('tt-teacher').value    = entry?.teacher   || '';
  document.getElementById('tt-memo').value       = entry?.memo      || '';
  document.getElementById('tt-start-time').value = entry?.start_time|| '';
  document.getElementById('tt-delete-btn').style.display = entry ? 'inline-block' : 'none';

  const opts = document.getElementById('tt-color-options');
  opts.innerHTML = '';
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'tt-color-btn' + (entry ? (entry.color === c ? ' selected' : '') : (c === COLORS[0] ? ' selected' : ''));
    btn.style.background = c;
    btn.dataset.color = c;
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
  const color      = document.getElementById('tt-color-options').querySelector('.selected')?.dataset.color || COLORS[0];
  const start_time = document.getElementById('tt-start-time').value || null;
  try {
    const data = await api('/timetable/', { method: 'POST', body: JSON.stringify({
      day, period, subject,
      room:    document.getElementById('tt-room').value.trim() || null,
      teacher: document.getElementById('tt-teacher').value.trim() || null,
      memo:    document.getElementById('tt-memo').value.trim() || null,
      color, start_time,
    })});
    timetableData[`${day}-${period}`] = data;
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable(); renderTodayBanner();
  } catch(e) { toast(e.message || '保存に失敗しました', 'error'); }
});

document.getElementById('tt-delete-btn').addEventListener('click', async () => {
  const entry = editingCell.entry;
  if (!entry) return;
  try {
    await api(`/timetable/${entry.id}`, { method: 'DELETE' });
    delete timetableData[`${editingCell.day}-${editingCell.period}`];
    document.getElementById('tt-modal').classList.add('hidden');
    renderTable(); renderTodayBanner();
  } catch(e) { toast(e.message || '削除に失敗しました', 'error'); }
});

// 設定パネル
document.getElementById('tt-settings-btn').addEventListener('click', () => {
  const panel = document.getElementById('tt-settings-panel');
  panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('tt-periods-select').addEventListener('change', e => {
  settings.periods = parseInt(e.target.value);
  localStorage.setItem('tt_periods', settings.periods);
  renderTable(); renderTodayBanner();
});

document.getElementById('tt-show-sun').addEventListener('change', e => {
  settings.showSun = e.target.checked;
  localStorage.setItem('tt_showSun', settings.showSun);
  renderTable(); renderTodayBanner();
});

init();
