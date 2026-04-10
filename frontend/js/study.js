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
  const saved = localStorage.getItem('study_tab') || 'tasks';
  document.querySelector(`.study-tab[data-tab="${saved}"]`)?.click();
});

async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  document.getElementById('task-due').value = new Date().toISOString().slice(0,10);
  document.getElementById('grade-date').value = new Date().toISOString().slice(0,10);
  await Promise.all([loadTasks(), loadGrades(), loadAttendance()]);
  // バッジチェック
  api('/badges/check', { method:'POST' }).catch(()=>{});
}

// ============================================================
// 課題管理 + 締切カレンダー
// ============================================================
const PRIORITY_LABELS = { high:'高', medium:'中', low:'低' };
const STATUS_LABELS   = { pending:'未着手', in_progress:'進行中', done:'完了' };
const STATUS_COLORS   = { pending:'var(--text-3)', in_progress:'#f5a623', done:'var(--green)' };
const PRIORITY_COLORS = { high:'var(--red)', medium:'#f5a623', low:'var(--green)' };
let tasksData = [], filterStatus = 'all';
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();

async function loadTasks() {
  tasksData = await api('/tasks/').catch(() => []);
  renderTasks(); renderTaskCalendar();
}

function renderTaskCalendar() {
  const el = document.getElementById('task-calendar');
  const lbl = document.getElementById('cal-label');
  if (!el) return;
  lbl.textContent = `${calYear}年${calMonth+1}月`;
  const first = new Date(calYear, calMonth, 1);
  const last  = new Date(calYear, calMonth+1, 0);
  const startDow = first.getDay();
  const today = new Date().toISOString().slice(0,10);

  // タスクをdue_dateでグループ化
  const byDate = {};
  tasksData.forEach(t => {
    if (!byDate[t.due_date]) byDate[t.due_date] = [];
    byDate[t.due_date].push(t);
  });

  let html = '<div class="cal-header">';
  ['日','月','火','水','木','金','土'].forEach(d => { html += `<div class="cal-day-label">${d}</div>`; });
  html += '</div><div class="cal-body">';

  // 空白セル
  for (let i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';

  for (let d = 1; d <= last.getDate(); d++) {
    const ds   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tasks = byDate[ds] || [];
    const isToday = ds === today;
    html += `<div class="cal-cell ${isToday?'cal-today':''}">
      <span class="cal-date ${isToday?'cal-today-num':''}">${d}</span>
      ${tasks.slice(0,2).map(t => {
        const col = t.priority==='high'?'var(--red)':t.priority==='medium'?'#f5a623':'var(--green)';
        return `<div class="cal-task-dot" style="background:${col}" title="${t.title}">${t.title.slice(0,6)}</div>`;
      }).join('')}
      ${tasks.length > 2 ? `<div style="font-size:9px;color:var(--text-3);">+${tasks.length-2}</div>` : ''}
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

document.getElementById('cal-prev')?.addEventListener('click', () => {
  if (--calMonth < 0) { calMonth = 11; calYear--; } renderTaskCalendar();
});
document.getElementById('cal-next')?.addEventListener('click', () => {
  if (++calMonth > 11) { calMonth = 0; calYear++; } renderTaskCalendar();
});

function renderTasks() {
  const el    = document.getElementById('tasks-list');
  const today = new Date().toISOString().slice(0,10);
  const items = filterStatus==='all' ? tasksData : tasksData.filter(t=>t.status===filterStatus);
  if (!items.length) { el.innerHTML='<p class="db-empty">課題はありません</p>'; return; }
  el.innerHTML = items.map(t => {
    const overdue  = t.due_date < today && t.status !== 'done';
    const daysLeft = Math.ceil((new Date(t.due_date)-new Date(today))/86400000);
    const daysLabel = t.status==='done' ? '' :
      daysLeft<0  ? `<span style="color:var(--red);font-weight:700;">${Math.abs(daysLeft)}日超過</span>` :
      daysLeft===0 ? `<span style="color:var(--red);font-weight:700;">今日締切</span>` :
      daysLeft<=3  ? `<span style="color:#f5a623;font-weight:700;">あと${daysLeft}日</span>` :
                    `<span style="color:var(--text-3);">あと${daysLeft}日</span>`;
    return `<div class="task-item ${t.status} ${overdue?'overdue':''}">
      <div class="task-item-left">
        <button class="task-status-btn" data-id="${t.id}" data-status="${t.status}">
          ${t.status==='done'?'✅':t.status==='in_progress'?'🔄':'⬜'}
        </button>
        <div>
          <div class="task-title ${t.status==='done'?'done-text':''}">${t.title}</div>
          <div class="task-meta">
            ${t.subject?`<span>${t.subject}</span>・`:''}<span>${t.due_date}</span>・${daysLabel}・<span style="color:${PRIORITY_COLORS[t.priority]};font-weight:600;">${PRIORITY_LABELS[t.priority]}</span>
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
      const id=parseInt(btn.dataset.id);
      const next=btn.dataset.status==='pending'?'in_progress':btn.dataset.status==='in_progress'?'done':'pending';
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
    if (!title){msg.style.color='var(--red)';msg.textContent='タイトルを入力してください';return;}
    if (!due)  {msg.style.color='var(--red)';msg.textContent='締切日を入力してください';return;}
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
      setTimeout(()=>{msg.textContent='';},2000);
    } catch(e){msg.style.color='var(--red)';msg.textContent=e.message||'追加失敗';}
  });

  document.querySelectorAll('.task-filter-btn').forEach(btn => {
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.task-filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); filterStatus=btn.dataset.status; renderTasks();
    });
  });
  document.getElementById('edit-task-cancel-btn').addEventListener('click',()=>document.getElementById('task-edit-modal').classList.add('hidden'));
  document.getElementById('edit-task-save-btn').addEventListener('click', async ()=>{
    const id=parseInt(document.getElementById('edit-task-id').value);
    const title=document.getElementById('edit-task-title').value.trim();
    const subject=document.getElementById('edit-task-subject').value.trim();
    const due=document.getElementById('edit-task-due').value;
    const priority=document.getElementById('edit-task-priority').value;
    const memo=document.getElementById('edit-task-memo').value.trim();
    try {
      await api(`/tasks/${id}`,{method:'PATCH',body:JSON.stringify({title,subject:subject||null,due_date:due,priority,memo:memo||null})});
      document.getElementById('task-edit-modal').classList.add('hidden'); await loadTasks();
    } catch(e){toast(e.message||'更新失敗','error');}
  });
  document.getElementById('edit-task-delete-btn').addEventListener('click', async ()=>{
    if (!confirm('この課題を削除しますか？')) return;
    const id=parseInt(document.getElementById('edit-task-id').value);
    try {
      await api(`/tasks/${id}`,{method:'DELETE'});
      document.getElementById('task-edit-modal').classList.add('hidden'); await loadTasks();
    } catch(e){toast(e.message||'削除失敗','error');}
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
let gradesData = [], chartInstance = null;

async function loadGrades() {
  gradesData = await api('/grades/').catch(() => []);
  renderGrades(); renderGradeChart();
}

function renderGrades() {
  const el = document.getElementById('grades-list');
  if (!gradesData.length) { el.innerHTML='<p class="db-empty">まだ成績がありません</p>'; return; }
  el.innerHTML = gradesData.map(g => {
    const pct=Math.round(g.score/g.max_score*100);
    const col=pct>=80?'var(--green)':pct>=60?'var(--accent)':pct>=40?'#f5a623':'var(--red)';
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
    el.addEventListener('click',()=>openGradeEdit(parseInt(el.dataset.id)));
  });
}

function renderGradeChart() {
  const ctx=document.getElementById('grades-chart').getContext('2d');
  const subjects={};
  gradesData.forEach(g=>{
    if (!subjects[g.subject]) subjects[g.subject]={total:0,maxTotal:0};
    subjects[g.subject].total+=g.score; subjects[g.subject].maxTotal+=g.max_score;
  });
  const labels=Object.keys(subjects);
  const avgs=labels.map(s=>Math.round(subjects[s].total/subjects[s].maxTotal*100));
  const colors=avgs.map(a=>a>=80?'#3ecf8e':a>=60?'#5b6ef5':a>=40?'#f5a623':'#f0476c');
  if (chartInstance) chartInstance.destroy();
  if (!labels.length){document.getElementById('grades-chart').style.display='none';return;}
  document.getElementById('grades-chart').style.display='';
  chartInstance=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'得点率(%)',data:avgs,backgroundColor:colors,borderRadius:6}]},
    options:{responsive:true,scales:{y:{min:0,max:100,ticks:{color:'#8892b0'},grid:{color:'#1e2640'}},x:{ticks:{color:'#8892b0'},grid:{display:false}}},plugins:{legend:{display:false}}}});
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('grade-add-btn').addEventListener('click', async ()=>{
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
      await loadGrades(); api('/badges/check',{method:'POST'}).catch(()=>{});
      setTimeout(()=>{msg.textContent='';},2000);
    } catch(e){msg.style.color='var(--red)';msg.textContent=e.message||'追加失敗';}
  });
  document.getElementById('edit-grade-cancel-btn').addEventListener('click',()=>document.getElementById('grade-edit-modal').classList.add('hidden'));
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

// ============================================================
// 出席管理
// ============================================================
let attendanceData = [];

async function loadAttendance() {
  attendanceData = await api('/attendance/').catch(() => []);
  renderAttendance();
}

function renderAttendance() {
  const el = document.getElementById('attendance-list');
  if (!attendanceData.length) {
    el.innerHTML = '<p class="db-empty">科目を登録してください</p>'; return;
  }
  el.innerHTML = attendanceData.map(a => {
    const pct  = a.attend_rate;
    const col  = a.danger ? 'var(--red)' : pct >= 80 ? 'var(--green)' : '#f5a623';
    const bar  = Math.min(100, pct);
    return `
    <div class="db-card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);">${a.subject}</div>
        <div style="text-align:right;">
          <span style="font-size:18px;font-weight:800;color:${col};">${pct}%</span>
          ${a.danger ? '<span style="font-size:11px;color:var(--red);font-weight:700;margin-left:4px;">要注意</span>' : ''}
        </div>
      </div>
      <div style="background:var(--border);border-radius:99px;height:8px;margin-bottom:8px;overflow:hidden;">
        <div style="width:${bar}%;height:100%;background:${col};border-radius:99px;transition:width 0.5s;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);">
        <span>出席 ${a.attended}/${a.total_classes} 回</span>
        <span>欠席 ${a.absences} 回</span>
        <span style="color:${a.can_skip<=1?'var(--red)':'var(--text-2)'};">あと${a.can_skip}回休める</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn-primary att-attend-btn" data-id="${a.id}" style="flex:1;padding:8px;font-size:12px;">出席 +1</button>
        <button class="btn-secondary att-absent-btn" data-id="${a.id}" style="flex:1;padding:8px;font-size:12px;">欠席 +1</button>
        <button class="btn-secondary att-edit-btn" data-id="${a.id}" data-subject="${a.subject}" data-total="${a.total_classes}" data-attended="${a.attended}" data-max="${a.max_absences}" style="padding:8px 12px;font-size:12px;">編集</button>
        <button class="btn-danger att-del-btn" data-id="${a.id}" style="padding:8px 12px;font-size:12px;">削除</button>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.att-attend-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try { await api(`/attendance/${btn.dataset.id}/attend`,{method:'PATCH',body:JSON.stringify({delta:1})}); await loadAttendance(); }
      catch(e){toast(e.message||'失敗','error');}
    });
  });
  document.querySelectorAll('.att-absent-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try { await api(`/attendance/${btn.dataset.id}/attend`,{method:'PATCH',body:JSON.stringify({delta:0})}); await loadAttendance(); }
      catch(e){toast(e.message||'失敗','error');}
    });
  });
  document.querySelectorAll('.att-edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.getElementById('att-subject').value  = btn.dataset.subject;
      document.getElementById('att-total').value    = btn.dataset.total;
      document.getElementById('att-attended').value = btn.dataset.attended;
      document.getElementById('att-max').value      = btn.dataset.max;
      document.getElementById('att-subject').focus();
    });
  });
  document.querySelectorAll('.att-del-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if (!confirm('この科目の出席記録を削除しますか？')) return;
      try { await api(`/attendance/${btn.dataset.id}`,{method:'DELETE'}); await loadAttendance(); }
      catch(e){toast(e.message||'失敗','error');}
    });
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('att-save-btn').addEventListener('click', async ()=>{
    const subject  = document.getElementById('att-subject').value.trim();
    const total    = parseInt(document.getElementById('att-total').value)||0;
    const attended = parseInt(document.getElementById('att-attended').value)||0;
    const max      = parseInt(document.getElementById('att-max').value)||5;
    const msg      = document.getElementById('att-msg');
    if (!subject){msg.style.color='var(--red)';msg.textContent='科目名を入力してください';return;}
    if (attended>total){msg.style.color='var(--red)';msg.textContent='出席数が授業数を超えています';return;}
    try {
      await api('/attendance/',{method:'POST',body:JSON.stringify({subject,total_classes:total,attended,max_absences:max})});
      msg.style.color='var(--green)'; msg.textContent='保存しました';
      document.getElementById('att-subject').value='';
      document.getElementById('att-total').value='0';
      document.getElementById('att-attended').value='0';
      await loadAttendance(); setTimeout(()=>{msg.textContent='';},2000);
    } catch(e){msg.style.color='var(--red)';msg.textContent=e.message||'保存失敗';}
  });
});

init();
