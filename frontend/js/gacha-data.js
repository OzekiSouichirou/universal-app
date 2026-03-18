// ============================================================
//  Polonix ガチャ データ定義 v0.8.5
//  AとBを別々に排出。インベントリはDB管理。
// ============================================================

const GACHA_RARITY = {
  N:    { weight: 50.0, color: '#9ea0a0', label: 'N',    glow: 'rgba(158,160,160,0.3)' },
  R:    { weight: 30.0, color: '#3ecf8e', label: 'R',    glow: 'rgba(62,207,142,0.4)'  },
  SR:   { weight: 15.0, color: '#41b4f5', label: 'SR',   glow: 'rgba(65,180,245,0.5)'  },
  SSR:  { weight:  4.0, color: '#f5a623', label: 'SSR',  glow: 'rgba(245,166,35,0.6)'  },
  UR:   { weight:  0.9, color: '#e87aaa', label: 'UR',   glow: 'rgba(232,122,170,0.7)' },
  SECR: { weight:  0.1, color: '#b06ef5', label: 'SECR', glow: 'rgba(176,110,245,0.8)' },
};

const POOL_A = {
  N: ['普通の','どこかの','昨日の','いつもの','放課後の','寝起きの','窓際の','休み時間の','空腹な','掃除中の','静かな','懐かしの','通学路の','のんびりした','月曜の','金曜の','昼休みの','雨の日の','晴れの日の','曇りの'],
  R: ['ギリギリの','意識高い','忘れ物の','前髪気にする','10分前の','サボり気味の','再テストの','スマホな','1限辛い','ノート白い','斜め上の','絶妙な','期待の','ちょいズレの','締切当日の','遅刻寸前の','内申気にする','テスト前夜の','部活帰りの','眠そうな'],
  SR: ['徹夜明けの','画面バキバキ','単位大好き','奨学金戦士','出席代行の','効率極めた','過去問握る','WiFi難民','速度制限中','カフェイン中毒','圧倒的な','最速の','記憶飛んだ','崖っぷちの','覚醒した','限界突破の','睡眠削った','一夜漬けの','赤点回避の','追い込まれた'],
  SSR: ['全知全能の','卒業確定の','フル単の','伝説の','歴史に刻む','神の加護の','偏差値∞の','覇道の','時代創る','唯一無二の','究極の','漆黒の','黄金の','異世界からの','勝利の','頂点の','無敗の','絶対零度の','奇跡の','運命を変えた'],
  UR: ['404な','概念上の','デバッグ中の','ログイン前の','実在しない','サーバー漏れの','課金兵の','運営の罠の','虚無からの','バグまみれ','ロード中の','未実装の','アプデ待ちの','仕様という','DB残滓の','キャッシュの','メモリ圧迫の','ヌルポの','無限ループの','例外無視の'],
  SECR: ['こってりの','濃厚な','マシマシな','背徳の','禁断の','一生分の','次元違いの','宇宙真理の','全悟りの','確率曲げた'],
};

const POOL_B = {
  N: ['学生','帰宅部員','通行人','ノート','鉛筆','消しゴム','掃除当番','購買民','学食民','図書館民','教室の主','運動場民','チャイム','自転車','ロッカー','上履き','体育館','プリント','出席番号','席替え組'],
  R: ['影の委員長','補習常連','自習室民','スマホ依存','学食行列','忘れ物番長','2階の主','昨日の敵','文化祭委員','風紀委員','放送室の主','お弁当箱','指定鞄','予備校生','部活幽霊','遅刻常連','黒板消し','廊下の主','図書委員','保健室民'],
  SR: ['効率の鬼','揚げパン神','救世主','インフルエンサー','カレーの残り','速制の犠牲者','WiFiの奴隷','暗記の天才','睡眠不足プロ','1限の敗者','就活生','レポート神','エナドリ','最後の切札','留年回避者','単位ハンター','赤点コレクター','模試の猛者','課題の亡者','試験場の刺客'],
  SSR: ['勝利の女神','キャンパス王','無敵就活生','伝説の卒業生','単位の神','奇跡の男','奇跡の女','完璧超人','叡智の結晶','最後の希望','支配者','賢者','聖騎士','英雄','覇者','真の天才','不滅の存在','神話の住人','時代の寵児','無双の学者'],
  UR: ['開発者の友','虚無','ログインボーナス','エラーコード','システム片','謎の塊','透明人間','未知のバグ','幽霊部員(真)','NPC','AIの化身','禁断データ','拡張機能','ログファイル','匿名希望','セキュリティ穴','デッドロック','デーモン','ゾンビ','スタック溢れ'],
  SECR: ['フリーター','浪人生','神の子','開発者','Polonixの主','運命の人','真の管理者','ガチャの申し子','伝説ユーザー','確率曲げし者'],
};

// ============================================================
//  ガチャロジック
// ============================================================
function gachaPickRarity() {
  const total = Object.values(GACHA_RARITY).reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const [key, r] of Object.entries(GACHA_RARITY)) {
    rand -= r.weight;
    if (rand <= 0) return key;
  }
  return 'N';
}

function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getRarityRank(r) { return {N:0,R:1,SR:2,SSR:3,UR:4,SECR:5}[r] ?? 0; }

function gachaRoll() {
  const rarityA = gachaPickRarity();
  const rarityB = gachaPickRarity();
  return {
    rarityA, textA: pickFrom(POOL_A[rarityA]),
    rarityB, textB: pickFrom(POOL_B[rarityB]),
    rarity: getRarityRank(rarityA) >= getRarityRank(rarityB) ? rarityA : rarityB,
  };
}

// ============================================================
//  インベントリ管理（DB管理版）
//  キャッシュはメモリのみ。ページリロードでDBから再取得。
// ============================================================

let _invCacheA = null;
let _invCacheB = null;

function getInventoryA() { return _invCacheA || []; }
function getInventoryB() { return _invCacheB || []; }

async function fetchInventoryFromDB(token, apiBase) {
  try {
    const res = await fetch(`${apiBase}/users/gacha/inventory`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const items = await res.json();
    _invCacheA = items.filter(i => i.type === 'A');
    _invCacheB = items.filter(i => i.type === 'B');
  } catch(e) { console.error('inventory fetch error:', e); }
}

// 旧localStorageデータをクリア（移行対応）
(function cleanOldStorage() {
  ['gacha_inventory','gacha_inv_a','gacha_inv_b'].forEach(k => localStorage.removeItem(k));
})();
