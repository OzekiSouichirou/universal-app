# Polonix ハンドオーバードキュメント v0.9.6-β

## プロジェクト概要
学生向けSNS×学習管理Webアプリ

| 項目 | 内容 |
|------|------|
| バージョン | v0.9.6-β |
| Backend | https://polonix-api-sod4.onrender.com |
| Frontend | https://polonix-3wbc.onrender.com |
| GitHub | https://github.com/OzekiSouichirou/universal-app |
| Windows作業パス | `C:\Projects\universal-app` |
| DB | Neon PostgreSQL（AWS Asia Pacific 1, Singapore） |
| キャッシュバスト | `?v=17` |

---

## スタック
- **Backend**: FastAPI, SQLAlchemy（`text()`のみ）, Pydantic 2.10.6
- **Frontend**: Vanilla JS, Chart.js, Canvas API
- **DB**: Neon PostgreSQL（free tier, pooler port 6543）
- **Hosting**: Render.com（backend + frontend静的配信）
- **監視**: UptimeRobot（5分間隔）

---

## ファイル構成

### Backend
```
backend/
├── main.py              # ルーター登録・テーブル作成・マイグレーション
├── auth.py / routes.py  # JWT認証
├── response.py          # ok() / err() レスポンスヘルパー
├── security.py          # レート制限・バリデーション
├── database.py          # Neon接続設定
├── env.py               # 環境変数
└── routes/
    ├── users.py         # ユーザー管理・get_current_user・require_admin
    ├── posts.py         # 掲示板投稿（tagカラム追加済み）
    ├── calendar.py      # カレンダーイベント（XP連動）
    ├── timetable.py     # 時間割（start_timeカラム追加済み）
    ├── notices.py       # お知らせ（is_pinned・priorityカラム追加済み）
    ├── stats.py         # 統計（grades/tasks/activity対応済み）
    ├── feedback.py      # ご意見箱
    ├── logs.py          # 操作ログ
    ├── grades.py        # 成績管理
    ├── tasks.py         # 課題管理
    ├── bookmarks.py     # ブックマーク
    ├── attendance.py    # 出席管理
    └── badges.py        # 実績バッジ（13種類）
```

### Frontend
```
frontend/
├── index.html / register.html  # ログイン・登録
├── home.html/js                # ホーム（デイリーミッション・XPバー）
├── board.html/js               # 掲示板（タグ・ブックマーク・通知ポーリング）
├── calendar.html/js            # カレンダー
├── timetable.html/js           # 時間割（4〜10限・日曜列対応）
├── study.html/js               # 学習管理（課題・成績・出席 タブ統合）
├── bookmarks.html/js           # ブックマーク一覧
├── game.html/js                # ゲーム関連（ポケモン・ガチャ・貧乏度チェッカー）
├── profile.html/js             # プロフィール
├── feedback.html/js            # ご意見箱
├── user-profile.html/js        # 他ユーザープロフィール
├── dashboard.html/js           # 管理者ダッシュボード
├── notices.html/js             # お知らせ管理（ピン留め・優先度）
├── users.html/js               # ユーザー管理
├── logs.html/js                # ログ確認
├── xp-admin.html/js            # XP管理
├── feedback-admin.html/js      # 意見箱管理
├── admin-settings.html/js      # 管理者設定
├── js/api.js                   # API通信（401自動ログアウト・429toast）
├── js/auth.js                  # 認証・ハンバーガーメニュー・PWAインストール
└── css/style.css               # 全スタイル
```

---

## DBテーブル一覧

| テーブル | 備考 |
|---------|------|
| users | bio, selected_title, selected_badges, is_banned |
| posts | tag VARCHAR(30) 追加済み |
| likes / comments / notifications | - |
| calendar_events | - |
| timetable | start_time VARCHAR(5) 追加済み |
| user_xp | fortune_date 追加済み |
| gacha_inventory | - |
| notices | is_pinned BOOLEAN, priority VARCHAR(10) 追加済み |
| feedback / logs | - |
| grades | username, subject, score, max_score, grade_type, memo, date |
| tasks | username, title, subject, due_date, priority, status, memo |
| bookmarks | username, post_id（UNIQUE制約） |
| attendance | username, subject, total_classes, attended, max_absences |
| badges | username, badge_id（UNIQUE制約） |

---

## マイグレーション（main.pyのrun_migrations）

```python
("user_xp",  "fortune_date",  "ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS fortune_date VARCHAR(10)"),
("timetable","start_time",    "ALTER TABLE timetable ADD COLUMN IF NOT EXISTS start_time VARCHAR(5)"),
("posts",    "tag",           "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tag VARCHAR(30)"),
("notices",  "is_pinned",     "ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false"),
("notices",  "priority",      "ALTER TABLE notices ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal'"),
```

---

## コーディング規約

### 命名規則
```
api()       ← apiFetch
toast()     ← showToast
token()     ← getToken
headers()   ← authHeaders
```

### JS パターン
```js
// API通信
const data = await api('/endpoint/', { method:'POST', body:JSON.stringify({...}) });

// トークン取得
localStorage.getItem('access_token') || sessionStorage.getItem('access_token')

// script読み込み順
<script src="js/api.js?v=17"></script>
<script src="js/auth.js?v=17"></script>
<script src="js/[page].js?v=17"></script>
```

### Python パターン
```python
# ルート定義順：/me を /{id} より前に
@router.get("/me")     # ← 先
@router.get("/{id}")   # ← 後

# SQLAlchemy
db.execute(text("SELECT ..."), {"param": value})

# テーブル名ホワイトリスト
_ALLOWED = frozenset(["posts", "users", ...])
```

---

## 重要な注意事項

| 項目 | 内容 |
|------|------|
| Neon pooler | `statement_timeout` 非対応（接続設定に含めない） |
| PowerShell保存 | `[System.IO.File]::WriteAllText()` 必須（Set-Contentは文字化け） |
| Python version | Render: `PYTHON_VERSION=3.11.9`（3.14系はpydantic-coreビルド不可） |
| UTC→JST | フロントで `created_at + 'Z'` を付与してtoLocaleString |
| checkAuth | 管理ページは `checkAuth(true)`、一般は `checkAuth(false)` |

---

## バッジ一覧（badges.py）

| ID | 名前 | 条件 |
|----|------|------|
| first_post | 初投稿 | 投稿1回 |
| post_10 | 投稿家 | 投稿10回 |
| post_50 | 投稿マスター | 投稿50回 |
| streak_3 | 3日連続 | 3日連続ログイン |
| streak_7 | 1週間皆勤 | 7日連続ログイン |
| streak_30 | 皆勤賞 | 30日連続ログイン |
| grade_90 | 優等生 | 成績90%以上 |
| grade_100 | 満点 | 満点取得 |
| task_done_10 | 課題完了 | 課題10件完了 |
| attend_perfect | 皆勤 | 出席率100%の科目あり |
| gacha_ssr | ラッキー | SSR以上排出 |
| lv_5 | Lv.5到達 | レベル5 |
| lv_10 | Lv.10到達 | レベル10 |

---

## 配置コマンド（v0.9.6用）

```powershell
$UTF8 = [System.Text.UTF8Encoding]::new($false)
$DL   = "C:\Users\nekoz\Downloads"
$FE   = "C:\Projects\universal-app\frontend"
$BE   = "C:\Projects\universal-app\backend"

# Backend
[System.IO.File]::WriteAllText("$BE\main.py",                [System.IO.File]::ReadAllText("$DL\main.py",        $UTF8), $UTF8)
[System.IO.File]::WriteAllText("$BE\routes\notices.py",      [System.IO.File]::ReadAllText("$DL\notices.py",     $UTF8), $UTF8)
[System.IO.File]::WriteAllText("$BE\routes\attendance.py",   [System.IO.File]::ReadAllText("$DL\attendance.py",  $UTF8), $UTF8)
[System.IO.File]::WriteAllText("$BE\routes\badges.py",       [System.IO.File]::ReadAllText("$DL\badges.py",      $UTF8), $UTF8)

# Frontend HTML
foreach ($name in @("study","bookmarks","notices","home","board","profile")) {
    [System.IO.File]::WriteAllText("$FE\$name.html", [System.IO.File]::ReadAllText("$DL\$name.html", $UTF8), $UTF8)
}

# Frontend JS
foreach ($f in @("study.js","bookmarks.js","notices.js")) {
    [System.IO.File]::WriteAllText("$FE\js\$f", [System.IO.File]::ReadAllText("$DL\$f", $UTF8), $UTF8)
}

# CSS
[System.IO.File]::WriteAllText("$FE\css\style.css", [System.IO.File]::ReadAllText("$DL\style.css", $UTF8), $UTF8)

cd C:\Projects\universal-app
git add .
git commit -m "feat: v0.9.6-β 出席管理・バッジ・ブックマーク一覧・締切カレンダー・お知らせピン留め"
git push origin main
```
