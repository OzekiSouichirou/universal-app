document.getElementById('logout-btn').addEventListener('click', logout);

// ============================================================
// タブ切り替え
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.study-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.study-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.study-tab-content').forEach(c => c.style.display = 'none');
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
      localStorage.setItem('study_tab', btn.dataset.tab);
    });
  });
  // 前回のタブを復元
  const saved = localStorage.getItem('study_tab') || 'tasks';
  const btn = document.querySelector(`.study-tab[data-tab="${saved}"]`);
  if (btn) btn.click();
});

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('task-due').value = new Date().toISOString().slice(0,10);
  document.getElementById('grade-date').value = new Date().toISOString().slice(0,10);
  await Promise.all([loadTasks(), loadGrades()]);
}

// ============================================================
// 課題管理
// ============================================================
const PRIORITY_LABELS = { high:'🔴 高', medium:'🟡 中', low:'🟢 低' };
const STATUS_LABELS   = { pending:'未着手', in_progress:'進行中', done:'完了' };
const STATUS_COLORS   = { pending:'var(--text-3)', in_progress:'#f5a623', done:'var(--green)' };
let tasksData   = [];
let filterStatus = 'all';

async function loadTasks() {
  tasksData = await api('/tasks/').catch(() => []);
  renderTasks();
}

function renderTasks() {
  const el    = document.getElementById('tasks-list');
  const today = new Date().toISOString().slice(0,10);
  const items = filterStatus === 'all' ? tasksData : tasksData.filter(t => t.status === filterStatus);
  if (!items.length) { el.innerHTML = '<p class="db-empty">課題はありません</p>'; return; }
  el.innerHTML = items.map(t => {
    const overdue  = t.due_date < today && t.status !== 'done';
    const daysLeft = Math.ceil((new Date(t.due_date) - new Date(today)) / 86400000);
    const daysLabel = t.status === 'done' ? '' :
      daysLeft < 0  ? `<span style="color:var(--red);font-weight:700;">${Math.abs(daysLeft)}日超過</span>` :
      daysLeft === 0 ? `<span style="color:var(--red);font-weight:700;">今日締切</span>` :
      daysLeft <= 3  ? `<span style="color:#f5a623;font-weight:700;">あと${daysLeft}日</span>` :
                       `<span style="color:var(--text-3);">あと${daysLeft}日</span>`;
    return `
    <div class="task-item ${t.status} ${overdue?'overdue':''}">
      <div class="task-item-left">
        <button class="task-status-btn" data-id="${t.id}" data-status="${t.status}">
          ${t.status==='done'?'✅':t.status==='in_progress'?'🔄':'⬜'}
        </button>
        <div>
          <div class="task-title ${t.status==='done'?'done-text':''}">${t.title}</div>
          <div class="task-meta">
            ${t.subject?`<span>${t.subject}</span>・`:''}
            <span>${t.due_date}</span>・${daysLabel}・<span>${PRIORITY_LABELS[t.priority]}</span>
            ${t.memo?`・<span style="color:var(--text-3)">${t.memo}</span>`:''}
          </div>
        </div>
      </div>
      <div class="task-item-right">
        <span class="task-status-label" style="color:${STATUS_COLORS[t.status]}">${STATUS_LABELS[t.status]}</span>
        <button class="task-edit-btn btn-secondary" data-id="${t.id}" style="padding:4px 10px;font-size:11px;">編集</button>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.task-status-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id   = parseInt(btn.dataset.id);
      const next = btn.dataset.status==='pending'?'in_progress':btn.dataset.status==='in_progress'?'done':'pending';
      try { await api(`/tasks/${id}/status`,{method:'PATCH',body:JSON.stringify({status:next})}); await loadTasks(); }
      catch(e) { toast(e.message||'更新失敗','error'); }
    });
  });
  document.querySelectorAll('.task-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openTaskEdit(parseInt(btn.dataset.id)); });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-add-btn').addEventListener('click', async () => {
    const title   = document.getElementById('task-title').value.trim();
    const subject = document.getElementById('task-subject').value.trim();
    const due     = document.getElementById('task-due').value;
    const priority= document.getElementById('task-priority').value;
    const memo    = document.getElementById('task-memo').value.trim();
    const msg     = document.getElementById('task-msg');
    if (!title) { msg.style.color='var(--red)'; msg.textContent='タイトルを入力してください'; return; }
    if (!due)   { msg.style.color='var(--red)'; msg.textContent='締切日を入力してください'; return; }
    try {
      await api('/tasks/',{method:'POST',body:JSON.stringify({title,subject:subject||null,due_date:due,priority,memo:memo||null})});
      if (document.getElementById('task-sync-cal')?.checked) {
        await api('/calendar/',{method:'POST',body:JSON.stringify({
          title:`【課題】${title}${subject?' ('+subject+')':''}`,date:due,type:'deadline',memo:memo||null
        })}).catch(()=>{});
      }
      msg.style.color='var(--green)'; msg.textContent='追加しました';
      document.getElementById('task-title').value='';
      document.getElementById('task-subject').value='';
      document.getElementById('task-memo').value='';
      await loadTasks();
      setTimeout(()=>{ msg.textContent=''; },2000);
    } catch(e) { msg.style.color='var(--red)'; msg.textContent=e.message||'追加失敗'; }
  });

  document.querySelectorAll('.task-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.task-filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); filterStatus=btn.dataset.status; renderTasks();
    });
  });

  document.getElementById('edit-task-cancel-btn').addEventListener('click', ()=>{ document.getElementById('task-edit-modal').classList.add('hidden'); });
  document.getElementById('edit-task-save-btn').addEventListener('click', async () => {
    const id=parseInt(document.getElementById('edit-task-id').value);
    const title=document.getElementById('edit-task-title').value.trim();
    const subject=document.getElementById('edit-task-subject').value.trim();
    const due=document.getElementById('edit-task-due').value;
    const priority=document.getElementById('edit-task-priority').value;
    const memo=document.getElementById('edit-task-memo').value.trim();
    try {
      await api(`/tasks/${id}`,{method:'PATCH',body:JSON.stringify({title,subject:subject||null,due_date:due,priority,memo:memo||null})});
      document.getElementById('task-edit-modal').classList.add('hidden'); await loadTasks();
    } catch(e) { toast(e.message||'更新失敗','error'); }
  });
  document.getElementById('edit-task-delete-btn').addEventListener('click', async () => {
    if (!confirm('この課題を削除しますか？')) return;
    const id=parseInt(document.getElementById('edit-task-id').value);
    try {
      await api(`/tasks/${id}`,{method:'DELETE'});
      document.getElementById('task-edit-modal').classList.add('hidden'); await loadTasks();
    } catch(e) { toast(e.message||'削除失敗','error'); }
  });
});

function openTaskEdit(id) {
  const t=tasksData.find(t=>t.id===id); if(!t) return;
  document.getElementById('edit-task-id').value=t.id;
  document.getElementById('edit-task-title').value=t.title;
  document.getElementById('edit-task-subject').value=t.subject||'';
  document.getElementById('edit-task-due').value=t.due_date;
  document.getElementById('edit-task-priority').value=t.priority;
  document.getElementById('edit-task-memo').value=t.memo||'';
  document.getElementById('task-edit-modal').classList.remove('hidden');
}

// ============================================================
// 成績管理
// ============================================================
const TYPE_LABELS = { exam:'試験', quiz:'小テスト', report:'レポート', other:'その他' };
let gradesData = [];
let chartInstance = null;

async function loadGrades() {
  gradesData = await api('/grades/').catch(() => []);
  renderGrades(); renderGradeChart();
}

function renderGrades() {
  const el = document.getElementById('grades-list');
  if (!gradesData.length) { el.innerHTML='<p class="db-empty">まだ成績がありません</p>'; return; }
  el.innerHTML = gradesData.map(g => {
    const pct = Math.round(g.score/g.max_score*100);
    const col = pct>=80?'var(--green)':pct>=60?'var(--accent)':pct>=40?'#f5a623':'var(--red)';
    return `<div class="grade-item" data-id="${g.id}">
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
  document.querySelectorAll('.grade-item').forEach(el=>{
    el.addEventListener('click', ()=>openGradeEdit(parseInt(el.dataset.id)));
  });
}

function renderGradeChart() {
  const ctx = document.getElementById('grades-chart').getContext('2d');
  const subjects = {};
  gradesData.forEach(g=>{
    if (!subjects[g.subject]) subjects[g.subject]={total:0,maxTotal:0};
    subjects[g.subject].total+=g.score; subjects[g.subject].maxTotal+=g.max_score;
  });
  const labels=Object.keys(subjects);
  const avgs=labels.map(s=>Math.round(subjects[s].total/subjects[s].maxTotal*100));
  const colors=avgs.map(a=>a>=80?'#3ecf8e':a>=60?'#5b6ef5':a>=40?'#f5a623':'#f0476c');
  if (chartInstance) chartInstance.destroy();
  if (!labels.length) { document.getElementById('grades-chart').style.display='none'; return; }
  document.getElementById('grades-chart').style.display='';
  chartInstance=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'得点率(%)',data:avgs,backgroundColor:colors,borderRadius:6}]},
    options:{responsive:true,scales:{
      y:{min:0,max:100,ticks:{color:'#8892b0'},grid:{color:'#1e2640'}},
      x:{ticks:{color:'#8892b0'},grid:{display:false}}
    },plugins:{legend:{display:false}}}
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('grade-add-btn').addEventListener('click', async () => {
    const subject=document.getElementById('grade-subject').value.trim();
    const score=parseFloat(document.getElementById('grade-score').value);
    const max=parseFloat(document.getElementById('grade-max').value)||100;
    const date=document.getElementById('grade-date').value;
    const type=document.getElementById('grade-type').value;
    const memo=document.getElementById('grade-memo').value.trim();
    const msg=document.getElementById('grade-msg');
    if (!subject){msg.style.color='var(--red)';msg.textContent='科目名を入力してください';return;}
    if (isNaN(score)){msg.style.color='var(--red)';msg.textContent='得点を入力してください';return;}
    if (!date){msg.style.color='var(--red)';msg.textContent='日付を入力してください';return;}
    try {
      await api('/grades/',{method:'POST',body:JSON.stringify({subject,score,max_score:max,grade_type:type,memo,date})});
      msg.style.color='var(--green)'; msg.textContent='追加しました';
      document.getElementById('grade-subject').value='';
      document.getElementById('grade-score').value='';
      document.getElementById('grade-memo').value='';
      await loadGrades(); setTimeout(()=>{msg.textContent='';},2000);
    } catch(e){msg.style.color='var(--red)';msg.textContent=e.message||'追加失敗';}
  });

  document.getElementById('edit-grade-cancel-btn').addEventListener('click',()=>{document.getElementById('grade-edit-modal').classList.add('hidden');});
  document.getElementById('edit-grade-save-btn').addEventListener('click', async ()=>{
    const id=parseInt(document.getElementById('edit-grade-id').value);
    const subject=document.getElementById('edit-grade-subject').value.trim();
    const score=parseFloat(document.getElementById('edit-grade-score').value);
    const max=parseFloat(document.getElementById('edit-grade-max').value);
    const date=document.getElementById('edit-grade-date').value;
    const type=document.getElementById('edit-grade-type').value;
    const memo=document.getElementById('edit-grade-memo').value.trim();
    try {
      await api(`/grades/${id}`,{method:'PATCH',body:JSON.stringify({subject,score,max_score:max,grade_type:type,memo,date})});
      document.getElementById('grade-edit-modal').classList.add('hidden'); await loadGrades();
    } catch(e){toast(e.message||'更新失敗','error');}
  });
  document.getElementById('edit-grade-delete-btn').addEventListener('click', async ()=>{
    if (!confirm('この成績を削除しますか？')) return;
    const id=parseInt(document.getElementById('edit-grade-id').value);
    try {
      await api(`/grades/${id}`,{method:'DELETE'});
      document.getElementById('grade-edit-modal').classList.add('hidden'); await loadGrades();
    } catch(e){toast(e.message||'削除失敗','error');}
  });
});

function openGradeEdit(id) {
  const g=gradesData.find(g=>g.id===id); if(!g) return;
  document.getElementById('edit-grade-id').value=g.id;
  document.getElementById('edit-grade-subject').value=g.subject;
  document.getElementById('edit-grade-date').value=g.date;
  document.getElementById('edit-grade-score').value=g.score;
  document.getElementById('edit-grade-max').value=g.max_score;
  document.getElementById('edit-grade-type').value=g.grade_type;
  document.getElementById('edit-grade-memo').value=g.memo||'';
  document.getElementById('grade-edit-modal').classList.remove('hidden');
}

init();
