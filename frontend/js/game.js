document.getElementById('logout-btn').addEventListener('click', logout);

const RARITY_COLOR = { SSR: '#f5a623', SR: '#41b4f5', R: '#3ecf8e', N: '#8892b0' };
const ATTR_COLOR   = { 火: '#f0476c', 水: '#41b4f5', 草: '#3ecf8e', 氷: '#a0d8ef', 毒: '#b06ef5', 光: '#f5e642', 闇: '#9999aa' };

let _heroes  = [];
let _party   = [];
let _scanner = null;
let _scanning = false;
const _subLoaded = {};

// ============================================================
// 画面遷移管理
// ============================================================
const screens = {
  landing: document.getElementById('pq-landing'),
  about:   document.getElementById('pq-about'),
  main:    document.getElementById('pq-main'),
};

function showScreen(name) {
  Object.values(screens).forEach(el => { if (el) el.style.display = 'none'; });
  if (screens[name]) screens[name].style.display = 'block';

  const backBtn = document.getElementById('pq-back-btn');
  const title   = document.getElementById('pq-title');
  if (name === 'landing') {
    backBtn.style.display = 'none';
    title.textContent = 'Pクエスト';
  } else if (name === 'about') {
    backBtn.style.display = 'inline-block';
    title.textContent = 'Pクエストとは';
  } else if (name === 'main') {
    backBtn.style.display = 'inline-block';
    title.textContent = 'Pクエスト';
  }
}

document.getElementById('btn-about')?.addEventListener('click', () => showScreen('about'));
document.getElementById('btn-enter')?.addEventListener('click', () => {
  showScreen('main');
  if (!_subLoaded.explore) { _subLoaded.explore = true; loadQuest(); }
});
document.getElementById('pq-back-btn')?.addEventListener('click', () => showScreen('landing'));

// ============================================================
// サブナビ切り替え
// ============================================================
document.querySelectorAll('.pq-subnav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pq-subnav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pq-sub-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    const key = btn.dataset.sub;
    const panel = document.getElementById('sub-' + key);
    if (panel) panel.style.display = 'block';

    if (!_subLoaded[key]) {
      _subLoaded[key] = true;
      if (key === 'party')   loadParty();
      if (key === 'detail')  loadHeroes();
      if (key === 'rewards') loadGachaXP().then(() => fetchInventoryFromDB()).then(() => renderGachaInventory());
    }
  });
});

// ============================================================
// 勇者カード
// ============================================================
function heroCard(h, mode = 'list') {
  const rc = RARITY_COLOR[h.rarity] || '#888';
  const ac = ATTR_COLOR[h.attribute] || '#888';
  const inParty = _party.some(p => p.id === h.id);

  if (mode === 'slot') {
    return `<div class="hero-card" style="--hero-color:${rc};min-width:120px;text-align:center;">
      <div class="hero-rarity" style="color:${rc}">${h.rarity}</div>
      <div class="hero-attr" style="color:${ac}">${h.attribute}</div>
      <div class="hero-name" style="font-size:13px;">${h.hero_name}</div>
      <button class="btn-secondary hero-remove-btn" data-id="${h.id}" style="font-size:11px;padding:4px 8px;margin-top:6px;width:100%;">外す</button>
    </div>`;
  }
  if (mode === 'select') {
    return `<div class="hero-card${inParty ? ' in-party' : ''}" style="--hero-color:${rc}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div><span class="hero-rarity" style="color:${rc}">${h.rarity}</span>
        <span class="hero-attr" style="color:${ac};margin-left:6px;">${h.attribute}</span></div>
      </div>
      <div class="hero-name">${h.hero_name}</div>
      <div class="hero-stats">
        <span>HP <b>${h.hp}</b></span><span>攻 <b>${h.attack}</b></span>
        <span>速 <b>${h.speed}</b></span><span>運 <b>${h.luck}</b></span>
      </div>
      <button class="btn-secondary hero-party-btn" data-id="${h.id}"
        style="font-size:11px;padding:4px 8px;margin-top:6px;width:100%;"
        ${inParty ? 'disabled' : ''}>${inParty ? 'パーティ中' : 'パーティに追加'}</button>
    </div>`;
  }
  return `<div class="hero-card" style="--hero-color:${rc}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div><span class="hero-rarity" style="color:${rc}">${h.rarity}</span>
      <span class="hero-attr" style="color:${ac};margin-left:6px;">${h.attribute}</span></div>
      <span style="font-size:11px;color:var(--text-3);">${new Date(h.created_at+'Z').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</span>
    </div>
    <div class="hero-name">${h.hero_name}</div>
    <div class="hero-stats">
      <span>HP <b>${h.hp}</b></span><span>攻 <b>${h.attack}</b></span>
      <span>速 <b>${h.speed}</b></span><span>運 <b>${h.luck}</b></span>
    </div>
    <div style="font-size:11px;color:var(--text-3);margin-top:4px;">JAN: ${h.jan_code}</div>
  </div>`;
}

// ============================================================
// 英雄詳細
// ============================================================
let _heroFilter = 'all';

async function loadHeroes() {
  if (!_heroes.length) _heroes = await api('/scan/heroes').catch(() => []);
  renderHeroes();
}

function renderHeroes() {
  const list     = document.getElementById('hero-list');
  const filtered = _heroFilter === 'all' ? _heroes : _heroes.filter(h => h.rarity === _heroFilter);
  list.innerHTML = filtered.length
    ? filtered.map(h => heroCard(h)).join('')
    : '<p style="color:var(--text-3);text-align:center;padding:24px;">勇者がいません</p>';
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
// パーティ編成
// ============================================================
async function loadParty() {
  if (!_heroes.length) _heroes = await api('/scan/heroes').catch(() => []);
  _party = await api('/scan/party').catch(() => []);
  renderParty();
}

function renderParty() {
  const slots = document.getElementById('party-slots');
  const sel   = document.getElementById('party-select-list');

  slots.innerHTML = _party.length
    ? _party.map(h => heroCard(h, 'slot')).join('')
    : '<p style="color:var(--text-3);font-size:13px;">パーティは空です</p>';

  slots.querySelectorAll('.hero-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      _party = _party.filter(h => h.id !== parseInt(btn.dataset.id));
      await saveParty();
    });
  });

  sel.innerHTML = _heroes.length
    ? _heroes.map(h => heroCard(h, 'select')).join('')
    : '<p style="color:var(--text-3);font-size:13px;padding:16px;">勇者を召喚してください</p>';

  sel.querySelectorAll('.hero-party-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (_party.length >= 3) { toast('パーティは最大3人です', 'error'); return; }
      const hero = _heroes.find(h => h.id === parseInt(btn.dataset.id));
      if (hero) { _party.push(hero); await saveParty(); }
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
// 英雄召喚
// ============================================================
async function doScan(jan) {
  const el = document.getElementById('scan-result');
  el.innerHTML = '<p style="color:var(--text-2);text-align:center;">召喚中...</p>';
  try {
    const hero = await api('/scan/', { method: 'POST', body: JSON.stringify({ jan_code: jan }) });
    _heroes.unshift(hero);
    const rc = RARITY_COLOR[hero.rarity] || '#888';
    const ac = ATTR_COLOR[hero.attribute] || '#888';
    el.innerHTML = `<div class="hero-card" style="--hero-color:${rc};border-color:${rc};">
      <div style="text-align:center;font-size:12px;color:var(--text-2);margin-bottom:8px;">召喚成功</div>
      <div style="text-align:center;">
        <span class="hero-rarity" style="color:${rc};font-size:18px;">${hero.rarity}</span>
        <span class="hero-attr" style="color:${ac};margin-left:8px;">${hero.attribute}属性</span>
      </div>
      <div class="hero-name" style="text-align:center;font-size:18px;margin:8px 0;">${hero.hero_name}</div>
      <div class="hero-stats" style="justify-content:center;">
        <span>HP <b>${hero.hp}</b></span><span>攻 <b>${hero.attack}</b></span>
        <span>速 <b>${hero.speed}</b></span><span>運 <b>${hero.luck}</b></span>
      </div>
      <div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:8px;">JAN: ${hero.jan_code}</div>
    </div>`;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--red);text-align:center;padding:12px;">${e.message || '召喚に失敗しました'}</p>`;
  }
}

document.getElementById('scan-start-btn')?.addEventListener('click', async () => {
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

document.getElementById('scan-stop-btn')?.addEventListener('click', async () => {
  if (_scanner) await _scanner.stop().catch(() => {});
  _scanning = false;
  document.getElementById('scan-start-btn').style.display = 'inline-block';
  document.getElementById('scan-stop-btn').style.display  = 'none';
});

document.getElementById('scan-manual-btn')?.addEventListener('click', () => {
  const val = document.getElementById('scan-manual-input').value.trim();
  if (!/^\d{8,13}$/.test(val)) { toast('8〜13桁の数字を入力してください', 'error'); return; }
  doScan(val);
});

document.getElementById('scan-manual-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('scan-manual-btn').click();
});

// ============================================================
// 開拓（クエスト）
// ============================================================
async function loadQuest() {
  if (!_party.length) _party = await api('/scan/party').catch(() => []);
  renderQuestPreview();
  checkQuestStatus();
}

function renderQuestPreview() {
  const el = document.getElementById('quest-party-preview');
  if (!_party.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-3);">パーティが編成されていません。「パーティ編成」で勇者を追加してください。</p>';
    return;
  }
  const power = _party.reduce((s, h) => s + h.attack * (1 + h.luck / 100), 0);
  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      ${_party.map(h => `<div style="font-size:13px;background:var(--surface-2);padding:6px 10px;border-radius:var(--r);border-left:3px solid ${RARITY_COLOR[h.rarity]||'#888'}">
        <span style="color:${RARITY_COLOR[h.rarity]||'#888'}">${h.rarity}</span> ${h.hero_name}
      </div>`).join('')}
    </div>
    <div style="font-size:13px;color:var(--text-2);">パーティ戦力: <b style="color:var(--accent-2)">${Math.round(power)}</b></div>`;
}

function checkQuestStatus() {
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
      <div style="font-size:13px;color:var(--text-2);margin-bottom:8px;">開拓中... ${Math.min(elapsed,8).toFixed(1)}時間経過</div>
      <div style="background:var(--surface-2);border-radius:99px;height:8px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--blue));border-radius:99px;"></div>
      </div>`;
  } else {
    startBtn.style.display  = 'inline-block';
    returnBtn.style.display = 'none';
    statusEl.innerHTML = '<p style="font-size:13px;color:var(--text-3);">まだ出発していません</p>';
  }
}

document.getElementById('quest-start-btn')?.addEventListener('click', async () => {
  if (!_party.length) { toast('パーティを編成してください', 'error'); return; }
  try {
    await api('/scan/quest/start', { method: 'POST', body: '{}' });
    localStorage.setItem('quest_started_at', Date.now().toString());
    checkQuestStatus();
    toast('開拓に出発しました');
  } catch(e) { toast(e.message || '出発に失敗しました', 'error'); }
});

document.getElementById('quest-return-btn')?.addEventListener('click', async () => {
  try {
    const res = await api('/scan/quest/result');
    localStorage.removeItem('quest_started_at');
    checkQuestStatus();
    document.getElementById('quest-result').innerHTML = `
      <div class="game-card" style="border-color:var(--accent);">
        <div class="game-card-title">開拓完了</div>
        <div style="font-size:14px;color:var(--text);">
          <div>経過時間: <b>${res.elapsed_hours}時間</b></div>
          <div>戦力: <b>${res.party_power}</b></div>
          <div style="color:var(--accent-2);font-size:16px;margin-top:8px;font-weight:700;">+ ${res.xp_gained} XP 獲得</div>
        </div>
      </div>`;
  } catch(e) { toast(e.message || '帰還に失敗しました', 'error'); }
});

// ============================================================
// 報酬（称号ガチャ）
// ============================================================
let gachaXP   = 0;
let _isRolling = false;

async function loadGachaXP() {
  try {
    const xp = await api('/calendar/xp');
    gachaXP  = xp?.xp ?? 0;
    document.getElementById('gacha-xp').textContent = gachaXP.toLocaleString() + ' XP';
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
    gachaXP = data.new_xp ?? gachaXP;
    document.getElementById('gacha-xp').textContent = gachaXP.toLocaleString() + ' XP';
    await fetchInventoryFromDB();
    const dup = data.dup_count ?? 0;
    const rc  = r => GACHA_RARITY[r]?.color || '#888';
    document.getElementById('gacha-result').innerHTML = `
      ${dup > 0 ? `<p class="gacha-dup-notice">かぶり${dup}枚 → +${dup} XP</p>` : ''}
      <div class="gacha-cards">
        ${rolls.map((r, i) => {
          const sr = data.results?.[i] || {};
          return `<div class="gacha-card rarity-${r.rarity}" style="--item-color:${rc(r.rarity)};--item-glow:${GACHA_RARITY[r.rarity]?.glow||'transparent'}">
            <div class="gacha-rarity" style="color:${rc(r.rarity)}">${r.rarity}</div>
            <div class="gacha-ab-row">
              <div class="gacha-part ${sr.dupA?'is-dup':''}">
                <span class="gacha-part-label" style="color:${rc(r.rarityA)}">A [${r.rarityA}]</span>
                <span class="gacha-part-text">${r.textA}</span>
                ${sr.dupA?'<span class="gacha-dup-tag">かぶり +1XP</span>':'<span class="gacha-new-tag">NEW</span>'}
              </div>
              <div class="gacha-part-sep">＋</div>
              <div class="gacha-part ${sr.dupB?'is-dup':''}">
                <span class="gacha-part-label" style="color:${rc(r.rarityB)}">B [${r.rarityB}]</span>
                <span class="gacha-part-text">${r.textB}</span>
                ${sr.dupB?'<span class="gacha-dup-tag">かぶり +1XP</span>':'<span class="gacha-new-tag">NEW</span>'}
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

document.getElementById('gacha-1')?.addEventListener('click',  () => rollAndShow(1));
document.getElementById('gacha-10')?.addEventListener('click', () => rollAndShow(10));

// ============================================================
// 初期化
// ============================================================
async function init() {
  const user = await checkAuth(false);
  if (!user) return;
  document.getElementById('current-user').textContent = user.username;
}

init();
