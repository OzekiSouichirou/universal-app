document.getElementById('logout-btn').addEventListener('click', logout);

const RARITY_COLOR = { SSR: '#f5a623', SR: '#41b4f5', R: '#3ecf8e', N: '#8892b0' };
const ATTR_COLOR   = { 火: '#f0476c', 水: '#41b4f5', 草: '#3ecf8e', 氷: '#a0d8ef', 毒: '#b06ef5', 光: '#f5e642', 闇: '#555' };

let _heroes   = [];
let _party    = [];
let _scanner  = null;
let _scanning = false;

// ============================================================
// タブ切り替え
// ============================================================
const _tabLoaded = {};

document.querySelectorAll('.game-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.game-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (!_tabLoaded[btn.dataset.tab]) {
      _tabLoaded[btn.dataset.tab] = true;
      if (btn.dataset.tab === 'heroes') loadHeroes();
      if (btn.dataset.tab === 'party')  loadParty();
      if (btn.dataset.tab === 'quest')  loadQuest();
    }
  });
});

// ============================================================
// 勇者カード生成
// ============================================================
function heroCard(h, mode = 'list') {
  const rc = RARITY_COLOR[h.rarity] || '#888';
  const ac = ATTR_COLOR[h.attribute]  || '#888';
  const inParty = _party.some(p => p.id === h.id);

  if (mode === 'party-slot') {
    return `<div class="hero-card" style="--hero-color:${rc};min-width:120px;">
      <div class="hero-rarity" style="color:${rc}">${h.rarity}</div>
      <div class="hero-attr" style="color:${ac}">${h.attribute}</div>
      <div class="hero-name">${h.hero_name}</div>
      <button class="btn-secondary hero-remove-btn" data-id="${h.id}" style="font-size:11px;padding:4px 8px;margin-top:6px;">外す</button>
    </div>`;
  }

  return `<div class="hero-card${inParty ? ' in-party' : ''}" style="--hero-color:${rc}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <span class="hero-rarity" style="color:${rc}">${h.rarity}</span>
        <span class="hero-attr" style="color:${ac};margin-left:6px;">${h.attribute}</span>
      </div>
      <span style="font-size:11px;color:var(--text-3);">${new Date(h.created_at + 'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</span>
    </div>
    <div class="hero-name">${h.hero_name}</div>
    <div class="hero-stats">
      <span>HP <b>${h.hp}</b></span>
      <span>攻 <b>${h.attack}</b></span>
      <span>速 <b>${h.speed}</b></span>
      <span>運 <b>${h.luck}</b></span>
    </div>
    ${mode === 'select' ? `<button class="btn-secondary hero-party-btn" data-id="${h.id}" style="font-size:11px;padding:4px 8px;margin-top:6px;width:100%;" ${inParty ? 'disabled' : ''}>${inParty ? 'パーティ中' : 'パーティに追加'}</button>` : ''}
  </div>`;
}

// ============================================================
// 召喚タブ
// ============================================================
async function doScan(janCode) {
  const el = document.getElementById('scan-result');
  el.innerHTML = '<p style="color:var(--text-2);text-align:center;">召喚中...</p>';
  try {
    const hero = await api('/scan/', { method: 'POST', body: JSON.stringify({ jan_code: janCode }) });
    _heroes.unshift(hero);
    const rc = RARITY_COLOR[hero.rarity] || '#888';
    const ac = ATTR_COLOR[hero.attribute]  || '#888';
    el.innerHTML = `
      <div class="hero-card" style="--hero-color:${rc};border-color:${rc};">
        <div style="text-align:center;font-size:12px;color:var(--text-2);margin-bottom:8px;">召喚成功</div>
        <div style="text-align:center;">
          <span class="hero-rarity" style="color:${rc};font-size:18px;">${hero.rarity}</span>
          <span class="hero-attr" style="color:${ac};margin-left:8px;">${hero.attribute}属性</span>
        </div>
        <div class="hero-name" style="text-align:center;font-size:18px;margin:8px 0;">${hero.hero_name}</div>
        <div class="hero-stats" style="justify-content:center;">
          <span>HP <b>${hero.hp}</b></span>
          <span>攻 <b>${hero.attack}</b></span>
          <span>速 <b>${hero.speed}</b></span>
          <span>運 <b>${hero.luck}</b></span>
        </div>
        <div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px;">JAN: ${hero.jan_code}</div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--red);text-align:center;padding:12px;">${e.message || '召喚に失敗しました'}</p>`;
  }
}

document.getElementById('scan-start-btn').addEventListener('click', async () => {
  if (_scanning) return;
  _scanning = true;
  document.getElementById('scan-start-btn').style.display = 'none';
  document.getElementById('scan-stop-btn').style.display  = 'inline-block';
  _scanner = new Html5Qrcode('scan-reader');
  try {
    await _scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 120 } },
      async (code) => {
        await _scanner.stop();
        _scanning = false;
        document.getElementById('scan-start-btn').style.display = 'inline-block';
        document.getElementById('scan-stop-btn').style.display  = 'none';
        await doScan(code);
      },
      () => {}
    );
  } catch {
    _scanning = false;
    document.getElementById('scan-start-btn').style.display = 'inline-block';
    document.getElementById('scan-stop-btn').style.display  = 'none';
    toast('カメラへのアクセスが拒否されました', 'error');
  }
});

document.getElementById('scan-stop-btn').addEventListener('click', async () => {
  if (_scanner) await _scanner.stop().catch(() => {});
  _scanning = false;
  document.getElementById('scan-start-btn').style.display = 'inline-block';
  document.getElementById('scan-stop-btn').style.display  = 'none';
});

document.getElementById('scan-manual-btn').addEventListener('click', () => {
  const val = document.getElementById('scan-manual-input').value.trim();
  if (!/^\d{8,13}$/.test(val)) { toast('8〜13桁の数字を入力してください', 'error'); return; }
  doScan(val);
});

document.getElementById('scan-manual-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('scan-manual-btn').click();
});

// ============================================================
// 勇者一覧タブ
// ============================================================
let _heroFilter = 'all';

async function loadHeroes() {
  _heroes = await api('/scan/heroes').catch(() => []);
  renderHeroes();
}

function renderHeroes() {
  const list   = document.getElementById('hero-list');
  const filtered = _heroFilter === 'all' ? _heroes : _heroes.filter(h => h.rarity === _heroFilter);
  if (!filtered.length) {
    list.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:24px;">勇者がいません</p>';
    return;
  }
  list.innerHTML = filtered.map(h => heroCard(h)).join('');
}

document.querySelectorAll('.hero-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hero-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _heroFilter = btn.dataset.filter;
    renderHeroes();
  });
});

// ============================================================
// パーティタブ
// ============================================================
async function loadParty() {
  if (!_heroes.length) _heroes = await api('/scan/heroes').catch(() => []);
  _party = await api('/scan/party').catch(() => []);
  renderParty();
}

function renderParty() {
  const slots = document.getElementById('party-slots');
  const sel   = document.getElementById('party-select-list');

  // スロット表示
  if (!_party.length) {
    slots.innerHTML = '<p style="color:var(--text-3);font-size:13px;">パーティは空です</p>';
  } else {
    slots.innerHTML = _party.map(h => heroCard(h, 'party-slot')).join('');
    slots.querySelectorAll('.hero-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        _party = _party.filter(h => h.id !== parseInt(btn.dataset.id));
        await saveParty();
      });
    });
  }

  // 選択リスト
  if (!_heroes.length) {
    sel.innerHTML = '<p style="color:var(--text-3);font-size:13px;padding:16px;">勇者を召喚してください</p>';
    return;
  }
  sel.innerHTML = _heroes.map(h => heroCard(h, 'select')).join('');
  sel.querySelectorAll('.hero-party-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (_party.length >= 3) { toast('パーティは最大3人です', 'error'); return; }
      const hero = _heroes.find(h => h.id === parseInt(btn.dataset.id));
      if (hero) {
        _party.push(hero);
        await saveParty();
      }
    });
  });
}

async function saveParty() {
  try {
    await api('/scan/party', { method: 'POST', body: JSON.stringify({ hero_ids: _party.map(h => h.id) }) });
    renderParty();
  } catch(e) { toast(e.message || '保存に失敗しました', 'error'); }
}

// ============================================================
// クエストタブ
// ============================================================
async function loadQuest() {
  if (!_party.length) _party = await api('/scan/party').catch(() => []);
  renderQuestPreview();
  await checkQuestStatus();
}

function renderQuestPreview() {
  const el = document.getElementById('quest-party-preview');
  if (!_party.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-3);">パーティが編成されていません</p>';
    return;
  }
  const power = _party.reduce((s, h) => s + h.attack * (1 + h.luck / 100), 0);
  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      ${_party.map(h => `<div style="font-size:13px;background:var(--surface-2);padding:6px 10px;border-radius:var(--r);border-left:3px solid ${RARITY_COLOR[h.rarity] || '#888'}">
        <span style="color:${RARITY_COLOR[h.rarity]||'#888'}">${h.rarity}</span> ${h.hero_name}
      </div>`).join('')}
    </div>
    <div style="font-size:13px;color:var(--text-2);">パーティ戦力: <b style="color:var(--accent-2)">${Math.round(power)}</b></div>`;
}

async function checkQuestStatus() {
  const startedAt = localStorage.getItem('quest_started_at');
  const statusEl  = document.getElementById('quest-status');
  const startBtn  = document.getElementById('quest-start-btn');
  const returnBtn = document.getElementById('quest-return-btn');

  if (startedAt) {
    const elapsed = (Date.now() - parseInt(startedAt)) / 3600000;
    const pct     = Math.min(elapsed / 8 * 100, 100);
    startBtn.style.display  = 'none';
    returnBtn.style.display = 'inline-block';
    statusEl.innerHTML = `
      <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">クエスト中... ${Math.min(elapsed, 8).toFixed(1)}時間経過</div>
      <div style="background:var(--surface-2);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--blue));border-radius:99px;transition:width 0.5s;"></div>
      </div>`;
  } else {
    startBtn.style.display  = 'inline-block';
    returnBtn.style.display = 'none';
    statusEl.innerHTML = '<p style="font-size:13px;color:var(--text-3);">クエストに出発していません</p>';
  }
}

document.getElementById('quest-start-btn').addEventListener('click', async () => {
  if (!_party.length) { toast('パーティを編成してください', 'error'); return; }
  try {
    await api('/scan/quest/start', { method: 'POST', body: '{}' });
    localStorage.setItem('quest_started_at', Date.now().toString());
    await checkQuestStatus();
    toast('クエストに出発しました');
  } catch(e) { toast(e.message || '開始に失敗しました', 'error'); }
});

document.getElementById('quest-return-btn').addEventListener('click', async () => {
  try {
    const res = await api('/scan/quest/result');
    localStorage.removeItem('quest_started_at');
    await checkQuestStatus();
    document.getElementById('quest-result').innerHTML = `
      <div class="game-card" style="border-color:var(--accent);">
        <div class="game-card-title">クエスト完了</div>
        <div style="font-size:14px;color:var(--text);">
          <div>経過時間: <b>${res.elapsed_hours}時間</b></div>
          <div>戦力: <b>${res.party_power}</b></div>
          <div style="color:var(--accent-2);font-size:16px;margin-top:8px;font-weight:700;">+ ${res.xp_gained} XP 獲得!</div>
        </div>
      </div>`;
  } catch(e) { toast(e.message || '帰還に失敗しました', 'error'); }
});

// ============================================================
// 称号ガチャ
// ============================================================
let gachaUserXP = 0;
let _isRolling  = false;

async function loadGachaXP() {
  try {
    const xp = await api('/calendar/xp');
    gachaUserXP = xp?.xp ?? 0;
    document.getElementById('gacha-xp').textContent = gachaUserXP.toLocaleString() + ' XP';
  } catch {
    document.getElementById('gacha-xp').textContent = '---';
  }
}

async function rollAndShow(count) {
  if (_isRolling) return;
  _isRolling = true;
  const btn1  = document.getElementById('gacha-1');
  const btn10 = document.getElementById('gacha-10');
  if (btn1)  btn1.disabled  = true;
  if (btn10) btn10.disabled = true;
  try {
    const rolls = Array.from({ length: count }, () => gachaRoll());
    const data  = await api('/users/gacha/roll', {
      method: 'POST',
      body: JSON.stringify({ count, results: rolls.map(r => ({ rarityA: r.rarityA, textA: r.textA, rarityB: r.rarityB, textB: r.textB })) }),
    });
    gachaUserXP = data.new_xp ?? gachaUserXP;
    document.getElementById('gacha-xp').textContent = gachaUserXP.toLocaleString() + ' XP';
    await fetchInventoryFromDB();
    const dupCount = data.dup_count ?? 0;
    const rc = r => GACHA_RARITY[r]?.color || '#888';
    document.getElementById('gacha-result').innerHTML = `
      ${dupCount > 0 ? `<p class="gacha-dup-notice">かぶり${dupCount}枚 → +${dupCount} XP</p>` : ''}
      <div class="gacha-cards">
        ${rolls.map((r, i) => {
          const sr = data.results?.[i] || {};
          return `<div class="gacha-card rarity-${r.rarity}" style="--item-color:${rc(r.rarity)};--item-glow:${GACHA_RARITY[r.rarity]?.glow||'transparent'}">
            <div class="gacha-rarity" style="color:${rc(r.rarity)}">${r.rarity}</div>
            <div class="gacha-ab-row">
              <div class="gacha-part ${sr.dupA?'is-dup':''}">
                <span class="gacha-part-label" style="color:${rc(r.rarityA)}">A [${r.rarityA}]</span>
                <span class="gacha-part-text">${r.textA}</span>
                ${sr.dupA ? '<span class="gacha-dup-tag">かぶり +1XP</span>' : '<span class="gacha-new-tag">NEW</span>'}
              </div>
              <div class="gacha-part-sep">＋</div>
              <div class="gacha-part ${sr.dupB?'is-dup':''}">
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
  } catch(e) {
    document.getElementById('gacha-result').innerHTML =
      `<p style="color:var(--red);text-align:center;padding:16px;">${e.message||'エラーが発生しました'}</p>`;
  } finally {
    _isRolling = false;
    if (btn1)  btn1.disabled  = false;
    if (btn10) btn10.disabled = false;
  }
}

function renderGachaInventory() {
  const el = document.getElementById('gacha-inventory');
  if (!el) return;
  const invA  = getInventoryA();
  const invB  = getInventoryB();
  const order = ['SECR','UR','SSR','SR','R','N'];
  const sort  = (a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity);
  if (!invA.length && !invB.length) {
    el.innerHTML = '<p style="color:var(--text-3);text-align:center;padding:16px;">まだ称号がありません</p>';
    return;
  }
  const mkList = (inv, type, col) =>
    [...inv].sort(sort).map(i => `
      <div class="gacha-inv-item">
        <span class="gacha-inv-type" style="background:${col}22;color:${col}">${type}</span>
        <span class="gacha-inv-rarity" style="color:${GACHA_RARITY[i.rarity]?.color}">${i.rarity}</span>
        <span class="gacha-inv-name">${i.text}</span>
      </div>`).join('');
  el.innerHTML = `
    <div class="gacha-inv-section">
      <div class="gacha-inv-label">A（形容詞）${invA.length}種</div>${mkList(invA,'A','var(--accent-2)')}
    </div>
    <div class="gacha-inv-section" style="margin-top:12px;">
      <div class="gacha-inv-label">B（役割）${invB.length}種</div>${mkList(invB,'B','var(--blue)')}
    </div>`;
}

document.getElementById('gacha-1').addEventListener('click',  () => rollAndShow(1));
document.getElementById('gacha-10').addEventListener('click', () => rollAndShow(10));

// ============================================================
// 初期化
// ============================================================
async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
  await Promise.all([loadGachaXP(), fetchInventoryFromDB()]);
  renderGachaInventory();
}

init();
