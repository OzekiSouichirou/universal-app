document.getElementById('logout-btn').addEventListener('click', logout);

const TYPE_LABELS = { exam:'試験', quiz:'小テスト', report:'レポート', other:'その他' };
let gradesData = [];
let chartInstance = null;

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('grade-date').value = new Date().toISOString().slice(0,10);
  await load();
}

async function load() {
  gradesData = await api('/grades/').catch(() => []);
  renderList();
  renderChart();
}

function renderList() {
  const el = document.getElementById('grades-list');
  if (!gradesData.length) { el.innerHTML = '<p class="db-empty">まだ成績がありません</p>'; return; }
  el.innerHTML = gradesData.map(g => {
    const pct = Math.round(g.score / g.max_score * 100);
    const col = pct >= 80 ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : pct >= 40 ? '#f5a623' : 'var(--red)';
    return `
    <div class="grade-item" data-id="${g.id}">
      <div class="grade-item-left">
        <div class="grade-subject">${g.subject}</div>
        <div class="grade-meta">${g.date} ・ ${TYPE_LABELS[g.grade_type]||g.grade_type}${g.memo?'・'+g.memo:''}</div>
      </div>
      <div class="grade-item-right">
        <div class="grade-score" style="color:${col}">${g.score}<span style="font-size:12px;color:var(--text-3)">/${g.max_score}</span></div>
        <div class="grade-pct" style="color:${col}">${pct}%</div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.grade-item').forEach(el => {
    el.addEventListener('click', () => openEditModal(parseInt(el.dataset.id)));
  });
}

function renderChart() {
  const ctx = document.getElementById('grades-chart').getContext('2d');
  // 科目別平均を計算
  const subjects = {};
  gradesData.forEach(g => {
    if (!subjects[g.subject]) subjects[g.subject] = { total: 0, count: 0, maxTotal: 0 };
    subjects[g.subject].total    += g.score;
    subjects[g.subject].maxTotal += g.max_score;
    subjects[g.subject].count++;
  });
  const labels = Object.keys(subjects);
  const avgs   = labels.map(s => Math.round(subjects[s].total / subjects[s].maxTotal * 100));
  const colors = avgs.map(a => a >= 80 ? '#3ecf8e' : a >= 60 ? '#5b6ef5' : a >= 40 ? '#f5a623' : '#f0476c');

  if (chartInstance) chartInstance.destroy();
  if (!labels.length) { document.getElementById('grades-chart').style.display = 'none'; return; }
  document.getElementById('grades-chart').style.display = '';
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '得点率(%)', data: avgs, backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      responsive: true,
      scales: {
        y: { min: 0, max: 100, ticks: { color: '#8892b0' }, grid: { color: '#1e2640' } },
        x: { ticks: { color: '#8892b0' }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

document.getElementById('grade-add-btn').addEventListener('click', async () => {
  const subject = document.getElementById('grade-subject').value.trim();
  const score   = parseFloat(document.getElementById('grade-score').value);
  const max     = parseFloat(document.getElementById('grade-max').value) || 100;
  const date    = document.getElementById('grade-date').value;
  const type    = document.getElementById('grade-type').value;
  const memo    = document.getElementById('grade-memo').value.trim();
  const msg     = document.getElementById('grade-msg');
  if (!subject) { msg.style.color='var(--red)'; msg.textContent='科目名を入力してください'; return; }
  if (isNaN(score)) { msg.style.color='var(--red)'; msg.textContent='得点を入力してください'; return; }
  if (!date) { msg.style.color='var(--red)'; msg.textContent='日付を入力してください'; return; }
  try {
    await api('/grades/', { method:'POST', body:JSON.stringify({ subject, score, max_score:max, grade_type:type, memo, date }) });
    msg.style.color='var(--green)'; msg.textContent='追加しました';
    document.getElementById('grade-subject').value = '';
    document.getElementById('grade-score').value   = '';
    document.getElementById('grade-memo').value    = '';
    await load();
    setTimeout(() => { msg.textContent=''; }, 2000);
  } catch(e) { msg.style.color='var(--red)'; msg.textContent=e.message||'追加に失敗しました'; }
});

function openEditModal(id) {
  const g = gradesData.find(g => g.id === id);
  if (!g) return;
  document.getElementById('edit-grade-id').value      = g.id;
  document.getElementById('edit-grade-subject').value = g.subject;
  document.getElementById('edit-grade-date').value    = g.date;
  document.getElementById('edit-grade-score').value   = g.score;
  document.getElementById('edit-grade-max').value     = g.max_score;
  document.getElementById('edit-grade-type').value    = g.grade_type;
  document.getElementById('edit-grade-memo').value    = g.memo || '';
  document.getElementById('grade-edit-modal').classList.remove('hidden');
}

document.getElementById('edit-grade-cancel-btn').addEventListener('click', () => {
  document.getElementById('grade-edit-modal').classList.add('hidden');
});

document.getElementById('edit-grade-save-btn').addEventListener('click', async () => {
  const id      = parseInt(document.getElementById('edit-grade-id').value);
  const subject = document.getElementById('edit-grade-subject').value.trim();
  const score   = parseFloat(document.getElementById('edit-grade-score').value);
  const max     = parseFloat(document.getElementById('edit-grade-max').value);
  const date    = document.getElementById('edit-grade-date').value;
  const type    = document.getElementById('edit-grade-type').value;
  const memo    = document.getElementById('edit-grade-memo').value.trim();
  try {
    await api(`/grades/${id}`, { method:'PATCH', body:JSON.stringify({ subject, score, max_score:max, grade_type:type, memo, date }) });
    document.getElementById('grade-edit-modal').classList.add('hidden');
    await load();
  } catch(e) { toast(e.message||'更新に失敗しました', 'error'); }
});

document.getElementById('edit-grade-delete-btn').addEventListener('click', async () => {
  if (!confirm('この成績を削除しますか？')) return;
  const id = parseInt(document.getElementById('edit-grade-id').value);
  try {
    await api(`/grades/${id}`, { method:'DELETE' });
    document.getElementById('grade-edit-modal').classList.add('hidden');
    await load();
  } catch(e) { toast(e.message||'削除に失敗しました', 'error'); }
});

init();
