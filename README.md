# Polonix

**v0.9.0-β** — 学生向けコミュニティ × 学習管理 Web アプリ

🌐 **フロントエンド:** https://polonix-3wbc.onrender.com  
🔌 **バックエンド API:** https://polonix-api-sod4.onrender.com  
📦 **リポジトリ:** https://github.com/OzekiSouichirou/universal-app

> Render.com 無料プランのため、非アクティブ時はスリープします。  
> 初回アクセスは最大 50 秒ほどかかる場合があります。  
> UptimeRobot で 14 分ごとに ping を送信しスリープを抑制しています。

---

## 技術スタック

| 区分 | 技術 | 備考 |
|------|------|------|
| フロントエンド | HTML + CSS + Vanilla JS | フレームワークなし |
| バックエンド | Python 3.11 + FastAPI | Render.com にホスト |
| DB | Supabase PostgreSQL | 生SQL（text()）で統一 |
| 認証 | JWT (python-jose) + bcrypt 4.0.1 | passlib 不使用 |
| ホスティング | Render.com（無料プラン） | スリープあり |
| PWA | Service Worker + manifest.json | polonix-v0.9.0 キャッシュ |

---

## 機能一覧

### ユーザー機能

| 機能 | 説明 |
|------|------|
| 認証 | ログイン / 新規登録 / ログアウト / ログイン維持 |
| 掲示板 | 投稿・削除・いいね・コメント・画像添付（600px 圧縮）・通知・検索・二つ名表示 |
| カレンダー | 個人イベント管理（メモ / 予定 / 試験 / 締め切り / イベント）・試験カウントダウン |
| 時間割 | 曜日×時限のグリッド・科目 / 教室 / 教員 / メモ / カラー設定 |
| プロフィール | アバター（HEIF 対応）・固有 ID・自己紹介文・称号装備・パスワード変更・アカウント削除 |
| ご意見箱 | 種別 / タイトル / 内容 / 匿名送信・送信履歴確認 |
| ゲーム関連 | ポケモンタイプ相性表・ダメージ計算機・ガチャ・ガチャガイド |
| XP / レベル | ログインボーナス・イベント完了・試験完了・ガチャかぶり・運勢でXP獲得・Lv.1〜11+ |
| デイリーミッション | ログイン / 投稿 / カレンダー追加の 3 ミッション・達成でXPボーナス |
| 試験カウントダウン | ホームに直近の試験までの残り日数を表示（3日以内赤・7日以内黄） |
| 運勢 | 毎日更新・大吉〜大凶・最大 +50XP |

### 管理者機能

| 機能 | 説明 |
|------|------|
| ダッシュボード | 統計グラフ（投稿推移・XPランキング・時間帯別）・今日の予定・時間割・サーバー状態 |
| ユーザー管理 | 一覧・追加・削除・権限変更・BAN / BAN解除 |
| お知らせ管理 | 追加・編集・削除・公開 / 非公開 |
| ログ確認 | 操作ログ（最新200件） |
| ご意見箱管理 | 一覧・ステータス変更（未対応 / 対応中 / 完了）・削除 |
| XP管理 | ユーザーへのXP配布・没収・リセット・クイック±100 |
| 称号管理 | ユーザーへの称号付与（A+B）・削除 |
| エラーページ確認 | 404 / 500 / オフラインページのプレビュー |

---

## ガチャシステム

- **消費XP:** 1回 50XP / 10連 450XP
- **排出形式:** A（形容詞）と B（役割）をそれぞれ独立したレアリティで排出
- **二つ名:** プロフィールで A + B を組み合わせて称号として装備可能
- **かぶり:** 既に所持している称号が出た場合、追加はされず +1XP ボーナス
- **連打防止:** ロール中はボタンを無効化し二重送信を防止

| レア | 確率 | 色 |
|------|------|----|
| N | 50% | グレー |
| R | 30% | 緑 |
| SR | 15% | 青 |
| SSR | 4% | 金 |
| UR | 0.9% | ピンク |
| SECR | 0.1% | 紫・パルス発光 |

---

## ディレクトリ構成

```
universal-app/
├── frontend/
│   ├── css/style.css
│   ├── js/
│   │   ├── api.js             # APIユーティリティ（parseResponse・fetchData・showToast）
│   │   ├── auth.js            # 認証共通・ハンバーガーメニュー・SW登録
│   │   ├── main.js            # ログイン
│   │   ├── register.js        # 新規登録
│   │   ├── home.js            # ホーム（ミッション・運勢・試験カウントダウン）
│   │   ├── board.js           # 掲示板（検索対応）
│   │   ├── calendar.js        # カレンダー
│   │   ├── timetable.js       # 時間割
│   │   ├── profile.js         # プロフィール
│   │   ├── feedback.js        # ご意見箱
│   │   ├── dashboard.js       # 管理者ダッシュボード
│   │   ├── users.js           # ユーザー管理
│   │   ├── notices.js         # お知らせ管理
│   │   ├── logs.js            # ログ確認
│   │   ├── admin-settings.js  # 管理者設定
│   │   ├── feedback-admin.js  # ご意見箱管理
│   │   ├── xp-admin.js        # XP・称号管理
│   │   ├── game.js            # ゲーム関連
│   │   ├── gacha-data.js      # ガチャデータ定義（共通）
│   │   └── user-profile.js    # 他ユーザープロフィール
│   ├── icons/
│   ├── manifest.json          # PWA マニフェスト（v0.9.0）
│   ├── sw.js                  # Service Worker（polonix-v0.9.0）
│   ├── 404.html
│   ├── 500.html
│   ├── offline.html
│   └── *.html
└── backend/
    ├── main.py                # FastAPI・ミドルウェア・セキュリティヘッダー・マイグレーション
    ├── response.py            # APIレスポンス統一（ok / err / E）
    ├── security.py            # レート制限・バリデーション・XSS対策・BAN確認
    ├── requirements.txt
    ├── runtime.txt            # PYTHON_VERSION=3.11.9 固定
    ├── auth/
    │   ├── auth.py
    │   └── routes.py          # /auth/login・/auth/register（レート制限付き）
    ├── models/
    │   └── database.py        # 生SQL専用DB接続層（ORM定義なし）
    └── routes/
        ├── users.py           # ユーザーCRUD・XP管理・称号・ガチャ・運勢・BAN
        ├── posts.py           # 投稿・いいね・コメント・通知・検索
        ├── calendar.py        # カレンダーイベント・XP・ログインボーナス
        ├── timetable.py
        ├── notices.py
        ├── logs.py
        ├── stats.py           # 統計（投稿推移・XPランキング・時間帯別）
        └── feedback.py
```

---

## DB テーブル

| テーブル | 主要カラム |
|---------|-----------|
| users | id, username, hashed_password, role, avatar, user_id, bio, selected_title, selected_title_a, selected_title_b, selected_badges, is_banned |
| posts | id, username, content, image |
| likes | post_id, username |
| comments | post_id, username, content |
| notifications | username, type, post_id, from_username, is_read |
| calendar_events | username, title, memo, date, type, is_done |
| timetable | username, day, period, subject, room, teacher, memo, color |
| user_xp | username, xp, level, streak, last_login, fortune_date |
| feedback | username, type, title, content, is_anonymous, status |
| gacha_inventory | username, type(A/B), rarity, text |
| logs | username, action, detail |
| notices | title, content, is_active |

---

## API レスポンス形式（v0.9.0〜）

```json
// 成功時
{ "success": true, "data": { ... } }

// 失敗時
{ "success": false, "error": { "code": "ERROR_CODE", "message": "エラーメッセージ" } }
```

フロントエンドでは `api.js` の `parseResponse(json, fallback)` で両形式に対応しています。

---

## セキュリティ（v0.9.0〜）

| 項目 | 内容 |
|------|------|
| レート制限 | ログイン 10回/5分・投稿 15回/分・ガチャ 5回/分 |
| 入力バリデーション | ユーザー名（英数字3〜30文字）・パスワード（6〜128文字）・HTMLタグ除去 |
| セキュリティヘッダー | X-Frame-Options: DENY・X-Content-Type-Options: nosniff・X-XSS-Protection |
| BAN機能 | 管理者がユーザーをBAN → ログイン不可・API全拒否 |
| ログイン失敗記録 | 失敗時にDBへログ記録 |

---

## ローカル開発

```powershell
cd C:\Projects\universal-app\backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

管理者アカウント（ローカルのみ）: `admin` / `admin1234`

**ファイル保存は必ず WriteAllText を使用**:
```powershell
$UTF8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText("保存先パス", [System.IO.File]::ReadAllText("ソースパス", $UTF8), $UTF8)
```

---

## 主な注意事項

- **Python バージョン:** Render では `PYTHON_VERSION=3.11.9` を固定（3.14 は pydantic-core ビルド不可）
- **bcrypt:** passlib は bcrypt 5.x と非互換 → bcrypt 直接使用（4.0.1 固定）
- **DB アクセス:** 生SQL（`text()`）に統一。SQLAlchemy ORM は使用しない
- **FastAPI ルート順序:** `/me` 系エンドポイントは `/{id}` 系より前に定義
- **日時:** UTC 保存 → フロントで `+'Z'` 付加して日本時間に変換
- **PWA キャッシュ:** CSS/JS 変更時は sw.js の `CACHE_NAME`（polonix-vX.X.X）を更新
- **DB マイグレーション:** `main.py` 起動時に `run_migrations()` で ALTER TABLE を自動実行
- **変数名衝突:** Python のリスト内包式のループ変数は外側スコープに漏れるため命名に注意

---

## バージョン履歴

| バージョン | 主な変更内容 |
|-----------|-------------|
| v0.1.0 | ユーザー登録・ログイン・管理者権限・ユーザー管理・ログ・お知らせ |
| v0.2.0 | 掲示板（投稿・削除・いいね・コメント）・UI 全面リデザイン |
| v0.3.0 | アバター（HEIF 対応）・固有 ID 自動生成・モバイル対応 |
| v0.4.0 | 通知機能・投稿画像添付（600px 圧縮） |
| v0.5.0 | パーソナルカレンダー・時間割・XP/レベルシステム |
| v0.6.0 | 管理者ダッシュボード統計グラフ・Python 3.11 固定 |
| v0.7.0 | PWA 対応・ご意見箱 |
| v0.7.5-β | バグ修正・サイドバー統一・桜グラデラインデザイン |
| v0.8.0-β | ゲーム関連ページ・XP管理・称号管理 |
| v0.8.1-β | プロフィール強化・他ユーザープロフィール閲覧 |
| v0.8.2-β | ガチャ刷新（二つ名・6段階レアリティ）・DB 自動マイグレーション |
| v0.8.3-β | ガチャ A・B 別排出・XP消費 API 化 |
| v0.8.5-β | ガチャインベントリ DB 管理化・生SQL でキャッシュ問題解決 |
| v0.8.6-β | 運勢システム・ロゴ更新・掲示板二つ名表示 |
| v0.9.0-β | DB層生SQL統一・APIレスポンス形式統一・セキュリティ強化（レート制限・XSS・BAN）・投稿検索・デイリーミッション・試験カウントダウン強化・エラーページ・PWAキャッシュ更新 |

---

## 今後の実装候補

- フォロー・フォロワー機能
- 勉強タイマー（ポモドーロ）→ XP 連動
- 成績管理（科目ごとの点数記録）
- 課題管理（提出日・科目・進捗）
- 掲示板投稿のスレッド形式リプライ
- 投稿のブックマーク・保存
- パスワードリセット
- ダイレクトメッセージ（DM）※WebSocket 必要
