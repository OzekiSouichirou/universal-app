document.getElementById('logout-btn').addEventListener('click', logout);

// ============================================================
// タブ切り替え（ガチャ・ガチャガイドのみ）
// ============================================================
document.querySelectorAll('.game-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.game-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ============================================================
// ガチャ XP 取得
// ============================================================
let gachaUserXP = 0;

async function loadGachaXP() {
  try {
    const xp = await api('/calendar/xp');
    gachaUserXP = xp?.xp ?? 0;
    document.getElementById('gacha-xp').textContent = gachaUserXP.toLocaleString() + ' XP';
  } catch {
    document.getElementById('gacha-xp').textContent = '---';
  }
}

// ============================================================
// ガチャ実行
// ============================================================
let _isRolling = false;

async function rollAndShow(count) {
  if (_isRolling) return;
  _isRolling = true;
  const btn1  = document.getElementById('gacha-1');
  const btn10 = document.getElementById('gacha-10');
  if (btn1)  btn1.disabled  = true;
  if (btn10) btn10.disabled = true;

  try {
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(gachaRoll());

    const data = await api('/users/gacha/roll', {
      method: 'POST',
      body: JSON.stringify({
        count,
        results: rolls.map(r => ({ rarityA: r.rarityA, textA: r.textA, rarityB: r.rarityB, textB: r.textB })),
      }),
    });

    gachaUserXP = data.new_xp ?? gachaUserXP;
    document.getElementById('gacha-xp').textContent = gachaUserXP.toLocaleString() + ' XP';
    await fetchInventoryFromDB();

    const dupCount = data.dup_count ?? 0;
    const rc = r => GACHA_RARITY[r]?.color || '#888';

    document.getElementById('gacha-result').innerHTML = `
      ${dupCount > 0 ? `<p class="gacha-dup-notice">かぶり${dupCount}枚 → +${dupCount} XP！</p>` : ''}
      <div class="gacha-cards">
        ${rolls.map((r, i) => {
          const sr = data.results?.[i] || {};
          return `<div class="gacha-card rarity-${r.rarity}" style="--item-color:${rc(r.rarity)};--item-glow:${GACHA_RARITY[r.rarity]?.glow || 'transparent'}">
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
  } catch(e) {
    document.getElementById('gacha-result').innerHTML =
      `<p style="color:var(--red);text-align:center;padding:16px;">${e.message || 'エラーが発生しました'}</p>`;
  } finally {
    _isRolling = false;
    if (btn1)  btn1.disabled  = false;
    if (btn10) btn10.disabled = false;
  }
}

// ============================================================
// インベントリ描画
// ============================================================
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
      <div class="gacha-inv-label">A（形容詞）${invA.length}種</div>
      ${mkList(invA, 'A', 'var(--accent-2)')}
    </div>
    <div class="gacha-inv-section" style="margin-top:12px;">
      <div class="gacha-inv-label">B（役割）${invB.length}種</div>
      ${mkList(invB, 'B', 'var(--blue)')}
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
  await loadGachaXP();
  await fetchInventoryFromDB();
  renderGachaInventory();
}

init();
