if (typeof parseResponse === 'undefined') {
  window.parseResponse = function(json, fb) {
    if (json && json.success === true) return json.data;
    if (json && json.success === false) return fb;
    return json != null ? json : fb;
  };
}
const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');

// ===================== タイプデータ =====================
const TYPES = [
  'ノーマル','ほのお','みず','でんき','くさ','こおり',
  'かくとう','どく','じめん','ひこう','エスパー','むし',
  'いわ','ゴースト','ドラゴン','あく','はがね','フェアリー'
];

const TYPE_EN = {
  'ノーマル':'normal','ほのお':'fire','みず':'water','でんき':'electric',
  'くさ':'grass','こおり':'ice','かくとう':'fighting','どく':'poison',
  'じめん':'ground','ひこう':'flying','エスパー':'psychic','むし':'bug',
  'いわ':'rock','ゴースト':'ghost','ドラゴン':'dragon','あく':'dark',
  'はがね':'steel','フェアリー':'fairy'
};

const TYPE_COLOR = {
  'ノーマル':'#9ea0a0','ほのお':'#f76c24','みず':'#538eed','でんき':'#f5cc17',
  'くさ':'#5dbd58','こおり':'#75d5d5','かくとう':'#ce3e6b','どく':'#a95fc8',
  'じめん':'#d97845','ひこう':'#8eaaed','エスパー':'#f461af','むし':'#90c12c',
  'いわ':'#c5b489','ゴースト':'#5064aa','ドラゴン':'#0a6ac9','あく':'#5b5369',
  'はがね':'#5b8ea5','フェアリー':'#ed76d0'
};

// 攻撃タイプ[i] → 防御タイプ[j] の倍率
// 2=2倍, 0.5=半減, 0=無効, 1=等倍
const CHART = {
  'ノーマル':  {'いわ':0.5,'はがね':0.5,'ゴースト':0},
  'ほのお':    {'ほのお':0.5,'みず':0.5,'いわ':0.5,'ドラゴン':0.5,'くさ':2,'こおり':2,'むし':2,'はがね':2},
  'みず':      {'みず':0.5,'くさ':0.5,'ドラゴン':0.5,'ほのお':2,'じめん':2,'いわ':2},
  'でんき':    {'でんき':0.5,'くさ':0.5,'ドラゴン':0.5,'じめん':0,'ひこう':2,'みず':2},
  'くさ':      {'ほのお':0.5,'くさ':0.5,'どく':0.5,'ひこう':0.5,'むし':0.5,'ドラゴン':0.5,'はがね':0.5,'みず':2,'じめん':2,'いわ':2},
  'こおり':    {'みず':0.5,'こおり':0.5,'くさ':2,'じめん':2,'ひこう':2,'ドラゴン':2},
  'かくとう':  {'どく':0.5,'ひこう':0.5,'エスパー':0.5,'むし':0.5,'フェアリー':0.5,'ゴースト':0,'ノーマル':2,'こおり':2,'いわ':2,'あく':2,'はがね':2},
  'どく':      {'どく':0.5,'じめん':0.5,'いわ':0.5,'ゴースト':0.5,'はがね':0,'くさ':2,'フェアリー':2},
  'じめん':    {'くさ':0.5,'むし':0.5,'でんき':0,'ほのお':2,'どく':2,'いわ':2,'はがね':2},
  'ひこう':    {'でんき':0.5,'いわ':0.5,'はがね':0.5,'じめん':0,'くさ':2,'かくとう':2,'むし':2},
  'エスパー':  {'エスパー':0.5,'はがね':0.5,'あく':0,'かくとう':2,'どく':2},
  'むし':      {'ほのお':0.5,'かくとう':0.5,'ひこう':0.5,'ゴースト':0.5,'はがね':0.5,'フェアリー':0.5,'くさ':2,'エスパー':2,'あく':2},
  'いわ':      {'かくとう':0.5,'じめん':0.5,'はがね':0.5,'ほのお':2,'こおり':2,'ひこう':2,'むし':2},
  'ゴースト':  {'ノーマル':0,'エスパー':0,'ゴースト':2,'あく':0.5},
  'ドラゴン':  {'はがね':0.5,'フェアリー':0,'ドラゴン':2},
  'あく':      {'かくとう':0.5,'あく':0.5,'フェアリー':0.5,'エスパー':0,'ゴースト':2,'エスパー':2},
  'はがね':    {'ほのお':0.5,'みず':0.5,'でんき':0.5,'はがね':0.5,'こおり':2,'いわ':2,'フェアリー':2},
  'フェアリー':{'ほのお':0.5,'どく':0.5,'はがね':0.5,'ドラゴン':0,'かくとう':2,'あく':2,'ドラゴン':2}
};

function getMultiplier(atkType, defType) {
  const row = CHART[atkType] || {};
  return row[defType] !== undefined ? row[defType] : 1;
}

function getCombinedMultiplier(atkType, def1, def2) {
  let m = getMultiplier(atkType, def1);
  if (def2 && def2 !== def1) m *= getMultiplier(atkType, def2);
  return m;
}

function multLabel(m) {
  if (m === 0)   return { text: '×0 無効', cls: 'mult-0' };
  if (m === 0.25) return { text: '×¼', cls: 'mult-025' };
  if (m === 0.5) return { text: '×½ 半減', cls: 'mult-05' };
  if (m === 1)   return { text: '×1', cls: 'mult-1' };
  if (m === 2)   return { text: '×2 効果◎', cls: 'mult-2' };
  if (m === 4)   return { text: '×4 効果◎◎', cls: 'mult-4' };
  return { text: `×${m}`, cls: 'mult-1' };
}

function typeTag(t) {
  return `<span class="type-tag" style="background:${TYPE_COLOR[t]}">${t}</span>`;
}

// ===================== タブ切り替え =====================
document.querySelectorAll('.game-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.game-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===================== 攻撃タイプ検索 =====================
function buildAtkGrid() {
  const grid = document.getElementById('atk-type-grid');
  TYPES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'type-select-btn';
    btn.textContent = t;
    btn.style.background = TYPE_COLOR[t];
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.type-select-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      showAtkResult(t);
    });
    grid.appendChild(btn);
  });
}

function showAtkResult(atkType) {
  const box = document.getElementById('atk-result');
  const groups = { 4:[], 2:[], 1:[], 0.5:[], 0.25:[], 0:[] };
  TYPES.forEach(def => {
    const m = getMultiplier(atkType, def);
    if (groups[m]) groups[m].push(def);
  });
  let html = `<div class="result-title">${typeTag(atkType)} で攻撃したとき</div>`;
  [[4,'×4'],[2,'×2'],[0.5,'×½'],[0.25,'×¼'],[0,'×0 無効']].forEach(([m, label]) => {
    if (groups[m] && groups[m].length > 0) {
      const { cls } = multLabel(m);
      html += `<div class="result-row"><span class="mult-badge ${cls}">${label}</span>${groups[m].map(typeTag).join('')}</div>`;
    }
  });
  box.innerHTML = html;
}

// ===================== 防御タイプ検索 =====================
let selectedDefTypes = [];

function buildDefGrid() {
  const grid = document.getElementById('def-type-grid');
  TYPES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'type-select-btn';
    btn.textContent = t;
    btn.style.background = TYPE_COLOR[t];
    btn.addEventListener('click', () => {
      if (selectedDefTypes.includes(t)) {
        selectedDefTypes = selectedDefTypes.filter(x => x !== t);
        btn.classList.remove('selected');
      } else {
        if (selectedDefTypes.length >= 2) {
          const first = selectedDefTypes.shift();
          grid.querySelectorAll('.type-select-btn').forEach(b => {
            if (b.textContent === first) b.classList.remove('selected');
          });
        }
        selectedDefTypes.push(t);
        btn.classList.add('selected');
      }
      showDefResult();
    });
    grid.appendChild(btn);
  });
}

function showDefResult() {
  if (selectedDefTypes.length === 0) {
    document.getElementById('def-result').innerHTML = '';
    return;
  }
  const [def1, def2] = selectedDefTypes;
  const box = document.getElementById('def-result');
  const groups = { 4:[], 2:[], 1:[], 0.5:[], 0.25:[], 0:[] };
  TYPES.forEach(atk => {
    const m = getCombinedMultiplier(atk, def1, def2 || '');
    if (groups[m] !== undefined) groups[m].push(atk);
    else groups[1].push(atk);
  });
  const label = def2 ? `${typeTag(def1)}/${typeTag(def2)}` : typeTag(def1);
  let html = `<div class="result-title">${label} が受けるとき</div>`;
  [[4,'×4'],[2,'×2 弱点'],[1,'×1'],[0.5,'×½ 耐性'],[0.25,'×¼ 耐性'],[0,'×0 無効']].forEach(([m, lbl]) => {
    if (groups[m] && groups[m].length > 0) {
      const { cls } = multLabel(m);
      html += `<div class="result-row"><span class="mult-badge ${cls}">${lbl}</span>${groups[m].map(typeTag).join('')}</div>`;
    }
  });
  box.innerHTML = html;
}

// ===================== 全タイプ相性一覧表 =====================
function buildFullTable() {
  const table = document.getElementById('type-full-table');
  let html = '<thead><tr><th class="tt-corner">攻撃↓ / 防御→</th>';
  TYPES.forEach(t => {
    html += `<th><span class="type-tag-v" style="background:${TYPE_COLOR[t]}">${t}</span></th>`;
  });
  html += '</tr></thead><tbody>';
  TYPES.forEach(atk => {
    html += `<tr><th><span class="type-tag" style="background:${TYPE_COLOR[atk]}">${atk}</span></th>`;
    TYPES.forEach(def => {
      const m = getMultiplier(atk, def);
      const { cls } = multLabel(m);
      const disp = m === 1 ? '' : (m === 0 ? '✕' : m === 2 ? '◎' : m === 4 ? '◎◎' : '△');
      html += `<td class="tc-cell ${cls}">${disp}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ===================== ダメージ計算機 =====================
function buildTypeSelects() {
  ['move-type','def-type1','def-type2'].forEach(id => {
    const sel = document.getElementById(id);
    TYPES.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  });
}

document.getElementById('calc-btn').addEventListener('click', () => {
  const atkStat  = parseInt(document.getElementById('atk-stat').value) || 1;
  const power    = parseInt(document.getElementById('move-power').value) || 1;
  const defStat  = parseInt(document.getElementById('def-stat').value) || 1;
  const hp       = parseInt(document.getElementById('hp-stat').value) || 1;
  const stab     = parseFloat(document.getElementById('stab').value);
  const critical = parseFloat(document.getElementById('critical').value);
  const rng      = parseFloat(document.getElementById('random-factor').value);
  const weather  = parseFloat(document.getElementById('weather').value);
  const burn     = parseFloat(document.getElementById('burn').value);
  const moveType = document.getElementById('move-type').value;
  const def1     = document.getElementById('def-type1').value;
  const def2     = document.getElementById('def-type2').value;

  // タイプ相性
  let typeEff = 1;
  if (moveType && def1) typeEff *= getMultiplier(moveType, def1);
  if (moveType && def2) typeEff *= getMultiplier(moveType, def2);

  // ポケモン剣盾/SVのダメージ計算式（簡易版）
  // ダメージ = ((2×レベル/5+2) × 技威力 × 攻撃/防御 / 50 + 2) × 補正
  // レベルは50固定
  const base = Math.floor((Math.floor(2 * 50 / 5 + 2) * power * atkStat / defStat) / 50 + 2);
  const damage = Math.floor(base * stab * typeEff * critical * weather * burn * rng);
  const pct = (damage / hp * 100).toFixed(1);

  const maxDmg = Math.floor(base * stab * typeEff * critical * weather * burn * 1.0);
  const minDmg = Math.floor(base * stab * typeEff * critical * weather * burn * 0.85);
  const maxPct = (maxDmg / hp * 100).toFixed(1);
  const minPct = (minDmg / hp * 100).toFixed(1);

  const typeLabel = typeEff === 0 ? '無効' : typeEff >= 4 ? '×4 効果バツグン！' : typeEff >= 2 ? '×2 効果バツグン！' : typeEff <= 0.25 ? '×¼ 効果いまひとつ…' : typeEff <= 0.5 ? '×½ 効果いまひとつ…' : '×1';
  const typeClass = typeEff === 0 ? 'mult-0' : typeEff >= 2 ? 'mult-2' : typeEff <= 0.5 ? 'mult-05' : 'mult-1';

  const ko = damage >= hp ? '🎯 <b>確定1発！</b>' :
             damage * 2 >= hp ? '⚡ 確定2発' :
             damage * 3 >= hp ? '確定3発' : `${Math.ceil(hp/damage)}発`;

  document.getElementById('calc-result').innerHTML = `
    <div class="calc-result-main">
      <div class="calc-result-dmg">${damage} ダメージ</div>
      <div class="calc-result-pct">${pct}% (${minPct}%〜${maxPct}%)</div>
      <div class="calc-result-ko">${ko}</div>
    </div>
    <div class="calc-result-detail">
      <span class="mult-badge ${typeClass}">${typeLabel}</span>
      <span style="font-size:12px;color:var(--text-2);">最小${minDmg}〜最大${maxDmg} / HP${hp}</span>
    </div>
  `;
});

// ===================== ガチャ =====================
let gachaUserXP = 0;

async function loadGachaXP() {
  const res = await fetch(`${API}/calendar/xp`, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return;
  const xpRaw = await res.json();
  const xp = (xpRaw && xpRaw.success === true) ? xpRaw.data : xpRaw;
  gachaUserXP = xp.xp ?? 0;
  document.getElementById('gacha-xp').textContent = gachaUserXP.toLocaleString() + ' XP';
}

let _isRolling = false;

async function rollAndShow(count) {
  if (_isRolling) return;
  _isRolling = true;
  const btn1 = document.getElementById('gacha-1');
  const btn10 = document.getElementById('gacha-10');
  if (btn1) btn1.disabled = true;
  if (btn10) btn10.disabled = true;

  try {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(gachaRoll());

    const res = await fetch(`${API}/users/gacha/roll`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count,
        results: rolls.map(r => ({
          rarityA: r.rarityA, textA: r.textA,
          rarityB: r.rarityB, textB: r.textB,
        }))
      })
    });

    if (!res.ok) {
      const errRaw = await res.json().catch(() => ({}));
      let errMsg = errRaw?.error?.message || errRaw?.detail || 'エラーが発生しました';
      if (res.status === 429) errMsg = 'リクエストが多すぎます。少し待ってから再試行してください。';
      document.getElementById('gacha-result').innerHTML =
        `<p style="color:var(--red);text-align:center;padding:16px;">${errMsg}</p>`;
      return;
    }

    const raw = await res.json();
    const data = parseResponse(raw, {});
    gachaUserXP = data.new_xp ?? gachaUserXP;
    document.getElementById('gacha-xp').textContent = (gachaUserXP ?? 0).toLocaleString() + ' XP';

    await fetchInventoryFromDB(token, API);

    const dupCount = data.dup_count ?? 0;
    const rc = (r) => GACHA_RARITY[r]?.color || '#888';
    const el = document.getElementById('gacha-result');
    el.innerHTML = `
      ${dupCount > 0 ? `<p class="gacha-dup-notice">かぶり${dupCount}枚 → +${dupCount} XP！</p>` : ''}
      <div class="gacha-cards">
        ${rolls.map((r, i) => {
          const sr = data.results?.[i] || {};
          return `
          <div class="gacha-card rarity-${r.rarity}" style="--item-color:${rc(r.rarity)};--item-glow:${GACHA_RARITY[r.rarity]?.glow||'transparent'}">
            <div class="gacha-rarity" style="color:${rc(r.rarity)}">${r.rarity}</div>
            <div class="gacha-ab-row">
              <div class="gacha-part ${sr.dupA ? 'is-dup' : ''}">
                <span class="gacha-part-label" style="color:${rc(r.rarityA)}">A [${r.rarityA}]</span>
                <span class="gacha-part-text">${r.textA}</span>
                ${sr.dupA ? '<span class="gacha-dup-tag">かぶり +1XP</span>' : '<span class="gacha-new-tag">NEW</span>'}
              </div>
              <div class="gacha-part-sep">＋</div>
              <div class="gacha-part ${sr.dupB ? 'is-dup' : ''}">
                <span class="gacha-part-label" style="color:${rc(r.rarityB)}">B [${r.rarityB}]</span>
                <span class="gacha-part-text">${r.textB}</span>
                ${sr.dupB ? '<span class="gacha-dup-tag">かぶり +1XP</span>' : '<span class="gacha-new-tag">NEW</span>'}
              </div>
            </div>
            <div class="gacha-preview-title">${r.textA} ${r.textB}</div>
          </div>`;
        }).join('')}
      </div>`;
    renderGachaInventory();

  } catch (e) {
    console.error('rollAndShow error:', e);
    document.getElementById('gacha-result').innerHTML =
      '<p style="color:var(--red);text-align:center;padding:16px;">エラーが発生しました</p>';
  } finally {
    _isRolling = false;
    if (btn1) btn1.disabled = false;
    if (btn10) btn10.disabled = false;
  }
}

function renderGachaInventory() {
  const el = document.getElementById('gacha-inventory');
  if (!el) return;
  const invA = getInventoryA();
  const invB = getInventoryB();
  const order = ['SECR', 'UR', 'SSR', 'SR', 'R', 'N'];
  const sortFn = (a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity);

  if (invA.length === 0 && invB.length === 0) {
    el.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:16px;">まだ称号がありません</p>';
    return;
  }
  const mkList = (inv, type, col) => [...inv].sort(sortFn).map(i =>
    `<div class="gacha-inv-item">
      <span class="gacha-inv-type" style="background:${col}22;color:${col}">${type}</span>
      <span class="gacha-inv-rarity" style="color:${GACHA_RARITY[i.rarity]?.color}">${i.rarity}</span>
      <span class="gacha-inv-name">${i.text}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="gacha-inv-section">
      <div class="gacha-inv-label">A（形容詞）${invA.length}種</div>
      ${mkList(invA, 'A', 'var(--accent-2)')}
    </div>
    <div class="gacha-inv-section" style="margin-top:12px;">
      <div class="gacha-inv-label">B（役割）${invB.length}種</div>
      ${mkList(invB, 'B', 'var(--blue)')}
    </div>`;
}

document.getElementById('gacha-1').addEventListener('click', () => rollAndShow(1));
document.getElementById('gacha-10').addEventListener('click', () => rollAndShow(10));


// ===================== 初期化 =====================
async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;

  buildAtkGrid();
  buildDefGrid();
  buildFullTable();
  buildTypeSelects();
  await loadGachaXP();
  renderGachaInventory();
}

init();
