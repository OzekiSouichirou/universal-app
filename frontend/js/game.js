document.getElementById('logout-btn').addEventListener('click', logout);

const RARITY_COLOR = { SSR: '#f5a623', SR: '#41b4f5', R: '#3ecf8e', N: '#8892b0' };
const ATTR_COLOR   = { 火: '#f0476c', 水: '#41b4f5', 草: '#3ecf8e', 氷: '#a0d8ef', 毒: '#b06ef5', 光: '#f5e642', 闇: '#9999aa' };

// ============================================================
// 英雄召喚 - スキャン実装
// html5-qrcode 2.3.8 を使用
// ライブスキャン + 写真読み取り（iOS Safari対応）
// ============================================================

let _qr       = null;
let _scanning = false;
let _scanTimer = null;
const SCAN_TIMEOUT = 60000;

function stopCamera() {
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
  if (_qr) {
    _qr.stop().catch(() => {});
    _qr.clear();
    _qr = null;
  }
  _scanning = false;
  const startBtn = document.getElementById('scan-start-btn');
  const stopBtn  = document.getElementById('scan-stop-btn');
  if (startBtn) startBtn.style.display = 'inline-block';
  if (stopBtn)  stopBtn.style.display  = 'none';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
});

// ライブスキャン
document.getElementById('scan-start-btn')?.addEventListener('click', () => {
  if (_scanning) return;
  _scanning = true;
  document.getElementById('scan-start-btn').style.display = 'none';
  document.getElementById('scan-stop-btn').style.display  = 'inline-block';
  document.getElementById('scan-result').innerHTML =
    '<p style="color:var(--text-2);text-align:center;font-size:13px;">バーコードをフレームに合わせてください</p>';

  // html5-qrcode: EAN-13/8専用設定
  // EAN_13=9, EAN_8=10, UPC_A=14, UPC_E=15, CODE_128=5 (html5-qrcode enum)
  _qr = new Html5Qrcode('scan-reader', {
    formatsToSupport: [9, 10, 14, 15, 5],
    verbose: false,
  });

  _qr.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 300, height: 80 },   // EAN-13は横長
      aspectRatio: 1.5,
      experimentalFeatures: { useBarCodeDetectorIfSupported: false },
    },
    (code) => {
      stopCamera();
      doScan(code);
    },
    () => {}
  ).catch(() => {
    stopCamera();
    toast('カメラへのアクセスが拒否されました', 'error');
  });

  _scanTimer = setTimeout(() => {
    stopCamera();
    toast('タイムアウトしました。「写真で読む」をお試しください。');
  }, SCAN_TIMEOUT);
});

document.getElementById('scan-stop-btn')?.addEventListener('click', () => stopCamera());

// 写真で読む（iOS Safari で最も確実）
// static input要素をHTMLに配置済み → iOSのセキュリティ制限を回避
document.getElementById('scan-photo-btn')?.addEventListener('click', () => {
  document.getElementById('scan-file-input').click();
});

document.getElementById('scan-file-input')?.addEventListener('change', async function() {
  const file = this.files?.[0];
  this.value = '';
  if (!file) return;

  const el = document.getElementById('scan-result');
  el.innerHTML = '<p style="color:var(--text-2);text-align:center;font-size:13px;">解析中...</p>';

  try {
    // EAN_13=9, EAN_8=10, UPC_A=14, UPC_E=15, CODE_128=5
    const tmpQr = new Html5Qrcode('_hidden_scan_target', {
      formatsToSupport: [9, 10, 14, 15, 5],
      verbose: false,
    });
    const code  = await tmpQr.scanFile(file, false);
    tmpQr.clear();
    await doScan(code);
  } catch {
    el.innerHTML = '<p style="color:var(--red);text-align:center;padding:12px;">'
      + 'バーコードを検出できませんでした。<br>'
      + 'バーコード部分をまっすぐ、明るい場所で撮影してください。</p>';
  }
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
