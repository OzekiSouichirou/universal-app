"""Polonix v0.9.7 - ユーザー管理ルート"""
from __future__ import annotations

import logging
import random
import string
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import text

from auth.auth import create_access_token, decode_token, hash_password, verify_password
from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from security import RATE, check_banned, check_rate_limit, validate_bio, validate_password, validate_username

router   = APIRouter()
_bearer  = HTTPBearer()
logger   = logging.getLogger("polonix.users")

# ================================================================
# XP レベルテーブル
# ================================================================
LEVEL_THRESHOLDS: list[int] = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000]


def calc_level(xp: int) -> int:
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp >= LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1


# ================================================================
# 連鎖削除ヘルパー（ホワイトリスト方式・SQLインジェクション対策済み）
# ================================================================
_CASCADE_POST_TABLES: frozenset[str] = frozenset(["likes", "comments", "notifications"])
_CASCADE_USER_TABLES: frozenset[str] = frozenset([
    "posts", "likes", "comments", "notifications",
    "calendar_events", "timetable", "user_xp",
    "feedback", "gacha_inventory",
])
_ORPHAN_TABLES: frozenset[str] = frozenset([
    "calendar_events", "timetable", "user_xp", "feedback", "gacha_inventory",
])


def _delete_user_data(db, username: str) -> None:
    post_ids = [
        r.id for r in db.execute(
            text("SELECT id FROM posts WHERE username = :u"), {"u": username}
        ).fetchall()
    ]
    if post_ids:
        ph     = ", ".join(f":pid{i}" for i in range(len(post_ids)))
        params = {f"pid{i}": pid for i, pid in enumerate(post_ids)}
        for tbl in _CASCADE_POST_TABLES:
            db.execute(text(f"DELETE FROM {tbl} WHERE post_id IN ({ph})"), params)
    for tbl in _CASCADE_USER_TABLES:
        db.execute(text(f"DELETE FROM {tbl} WHERE username = :u"), {"u": username})


def _update_xp(db, username: str, new_xp: int) -> tuple[int, int]:
    lv = calc_level(new_xp)
    db.execute(text("""
        INSERT INTO user_xp (username, xp, level) VALUES (:u, :xp, :lv)
        ON CONFLICT (username) DO UPDATE SET xp = :xp, level = :lv
    """), {"u": username, "xp": new_xp, "lv": lv})
    return new_xp, lv


# ================================================================
# 認証依存関数
# ================================================================
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db=Depends(get_db),
):
    """JWT を検証してユーザー行を返す。BAN 済みなら 403。"""
    payload  = decode_token(credentials.credentials)
    username = payload.get("sub")
    row = db.execute(
        text("""
            SELECT id, username, role, avatar, user_id, is_banned,
                   bio, selected_title, selected_title_a, selected_title_b,
                   selected_badges, created_at
            FROM users WHERE username = :u
        """),
        {"u": username},
    ).fetchone()
    if not row:
        err(E.UNAUTHORIZED, "ユーザーが見つかりません", 401)
    check_banned(row.is_banned, row.username)
    return row


def require_admin(current_user=Depends(get_current_user)):
    """管理者権限を要求する。"""
    if current_user.role != "admin":
        err(E.FORBIDDEN, "管理者権限が必要です", 403)
    return current_user


# ================================================================
# Pydantic スキーマ
# ================================================================
class PasswordUpdate(BaseModel):
    current_password: str
    new_password:     str


class AvatarUpdate(BaseModel):
    avatar: str


class ProfileUpdate(BaseModel):
    bio:              str = ""
    selected_title:   str = ""
    selected_title_a: str = ""
    selected_title_b: str = ""
    selected_badges:  str = "[]"


class UserCreate(BaseModel):
    username: str
    password: str
    role:     str = "user"


class RoleUpdate(BaseModel):
    role: str


class XPManage(BaseModel):
    username: str
    amount:   int
    reason:   str = ""


class TitleManage(BaseModel):
    username: str
    title_a:  str = ""
    title_b:  str = ""
    reason:   str = ""


class GachaRollRequest(BaseModel):
    count:   int
    results: list


# ================================================================
# /me 系エンドポイント（/{id} より先に定義 — FastAPI のルート解決順）
# ================================================================
@router.get("/avatars")
def get_avatars(db=Depends(get_db), _=Depends(get_current_user)):
    rows = db.execute(text("SELECT username, avatar FROM users")).fetchall()
    return ok({r.username: r.avatar for r in rows})


@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    """get_current_user が既に全カラムを取得しているので追加クエリなし。"""
    u = current_user
    return ok({
        "id":               u.id,
        "username":         u.username,
        "role":             u.role,
        "avatar":           u.avatar,
        "user_id":          u.user_id,
        "bio":              u.bio              or "",
        "selected_title":   u.selected_title   or "",
        "selected_title_a": u.selected_title_a or "",
        "selected_title_b": u.selected_title_b or "",
        "selected_badges":  u.selected_badges  or "[]",
        "created_at":       str(u.created_at)  if u.created_at else "",
    })


@router.patch("/me/password")
def change_password(
    body: PasswordUpdate,
    request: Request,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    check_rate_limit(f"password:{current_user.username}", *RATE["password"])
    validate_password(body.new_password)
    row = db.execute(
        text("SELECT hashed_password FROM users WHERE id = :id"),
        {"id": current_user.id},
    ).fetchone()
    if not row or not verify_password(body.current_password, row.hashed_password):
        err(E.INVALID_INPUT, "現在のパスワードが違います")
    db.execute(
        text("UPDATE users SET hashed_password = :h WHERE id = :id"),
        {"h": hash_password(body.new_password), "id": current_user.id},
    )
    db.execute(
        text("INSERT INTO logs (username, action) VALUES (:u, 'パスワード変更')"),
        {"u": current_user.username},
    )
    return ok({"message": "パスワードを変更しました"})


@router.patch("/me/avatar")
def update_avatar(body: AvatarUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.avatar.startswith("data:image/"):
        err(E.INVALID_INPUT, "無効な画像データです")
    if len(body.avatar) > 2 * 1024 * 1024:
        err(E.INVALID_INPUT, "画像サイズが大きすぎます（上限1MB）")
    db.execute(
        text("UPDATE users SET avatar = :a WHERE id = :id"),
        {"a": body.avatar, "id": current_user.id},
    )
    db.execute(
        text("INSERT INTO logs (username, action) VALUES (:u, 'アバター更新')"),
        {"u": current_user.username},
    )
    return ok({"message": "画像を変更しました"})


@router.delete("/me/avatar")
def delete_avatar(db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(text("UPDATE users SET avatar = NULL WHERE id = :id"), {"id": current_user.id})
    db.execute(
        text("INSERT INTO logs (username, action) VALUES (:u, 'アバター削除')"),
        {"u": current_user.username},
    )
    return ok({"message": "画像を削除しました"})


@router.delete("/me")
def delete_me(db=Depends(get_db), current_user=Depends(get_current_user)):
    uname = current_user.username
    _delete_user_data(db, uname)
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": current_user.id})
    db.execute(
        text("INSERT INTO logs (username, action) VALUES (:u, 'アカウント削除')"),
        {"u": uname},
    )
    return ok({"message": "アカウントを削除しました"})


@router.patch("/me/profile")
def update_profile(body: ProfileUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    validate_bio(body.bio)
    db.execute(text("""
        UPDATE users
        SET bio              = :bio,
            selected_title   = :title,
            selected_title_a = :title_a,
            selected_title_b = :title_b,
            selected_badges  = :badges
        WHERE id = :id
    """), {
        "bio":     body.bio,
        "title":   body.selected_title,
        "title_a": body.selected_title_a,
        "title_b": body.selected_title_b,
        "badges":  body.selected_badges,
        "id":      current_user.id,
    })
    return ok({
        "message":          "プロフィールを保存しました",
        "selected_title":   body.selected_title,
        "selected_title_a": body.selected_title_a,
        "selected_title_b": body.selected_title_b,
    })


@router.get("/profile/{username}")
def get_user_profile(username: str, db=Depends(get_db), _=Depends(get_current_user)):
    row = db.execute(text("""
        SELECT u.id, u.username, u.user_id, u.avatar, u.role, u.created_at,
               u.bio, u.selected_title, u.selected_title_a, u.selected_title_b,
               u.selected_badges,
               COALESCE(x.xp,0)     AS xp,
               COALESCE(x.level,1)  AS level,
               COALESCE(x.streak,0) AS streak,
               (SELECT COUNT(*) FROM posts WHERE username = u.username) AS post_count
        FROM users u
        LEFT JOIN user_xp x ON x.username = u.username
        WHERE u.username = :username
    """), {"username": username}).fetchone()
    if not row:
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    return ok(row_to_dict(row))


# ================================================================
# ユーザー管理（管理者）
# ================================================================
_VALID_ROLES: frozenset[str] = frozenset(["user", "admin"])


@router.get("/")
def get_users(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(
        text("SELECT id, username, role, is_banned, created_at FROM users ORDER BY id")
    ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/")
def create_user(body: UserCreate, db=Depends(get_db), admin=Depends(require_admin)):
    validate_username(body.username)
    validate_password(body.password)
    if body.role not in _VALID_ROLES:
        err(E.INVALID_INPUT, "role は user または admin のみ指定できます")
    if db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": body.username}).fetchone():
        err(E.DUPLICATE, "このユーザー名は既に使用されています")
    uid = "#" + "".join(random.choices(string.digits, k=8))
    db.execute(
        text("INSERT INTO users (username, hashed_password, role, user_id) VALUES (:u,:p,:r,:uid)"),
        {"u": body.username, "p": hash_password(body.password), "r": body.role, "uid": uid},
    )
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'ユーザー作成', :d)"),
        {"a": admin.username, "d": body.username},
    )
    return ok({"message": f"{body.username} を作成しました"})


@router.delete("/{user_id}")
def delete_user(user_id: int, db=Depends(get_db), admin=Depends(require_admin)):
    row = db.execute(text("SELECT username FROM users WHERE id = :id"), {"id": user_id}).fetchone()
    if not row:
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    _delete_user_data(db, row.username)
    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'ユーザー削除', :d)"),
        {"a": admin.username, "d": row.username},
    )
    return ok({"message": f"{row.username} を削除しました"})


@router.patch("/{user_id}/role")
def update_role(user_id: int, body: RoleUpdate, db=Depends(get_db), admin=Depends(require_admin)):
    if body.role not in _VALID_ROLES:
        err(E.INVALID_INPUT, "role は user または admin のみ指定できます")
    row = db.execute(text("SELECT username FROM users WHERE id = :id"), {"id": user_id}).fetchone()
    if not row:
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    db.execute(
        text("UPDATE users SET role = :r WHERE id = :id"),
        {"r": body.role, "id": user_id},
    )
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, '権限変更', :d)"),
        {"a": admin.username, "d": f"{row.username} → {body.role}"},
    )
    return ok({"message": f"{row.username} の権限を {body.role} に変更しました"})


@router.patch("/{user_id}/ban")
def toggle_ban(user_id: int, db=Depends(get_db), admin=Depends(require_admin)):
    row = db.execute(
        text("SELECT username, is_banned FROM users WHERE id = :id"), {"id": user_id}
    ).fetchone()
    if not row:
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    new_state = not row.is_banned
    db.execute(
        text("UPDATE users SET is_banned = :b WHERE id = :id"),
        {"b": new_state, "id": user_id},
    )
    action = "BAN" if new_state else "BAN解除"
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, :ac, :d)"),
        {"a": admin.username, "ac": action, "d": row.username},
    )
    return ok({"message": f"{row.username} を{action}しました", "is_banned": new_state})


@router.post("/admin/cleanup-orphan-data")
def cleanup_orphan_data(db=Depends(get_db), admin=Depends(require_admin)):
    existing = [r.username for r in db.execute(text("SELECT username FROM users")).fetchall()]
    if not existing:
        return ok({"deleted": 0})
    ph     = ", ".join(f":u{i}" for i in range(len(existing)))
    params = {f"u{i}": u for i, u in enumerate(existing)}
    deleted = 0
    for tbl in _ORPHAN_TABLES:
        result = db.execute(
            text(f"DELETE FROM {tbl} WHERE username NOT IN ({ph})"), params
        )
        deleted += result.rowcount
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, '孤立データ削除', :d)"),
        {"a": admin.username, "d": f"{deleted}件削除"},
    )
    return ok({"deleted": deleted})


# ================================================================
# XP 管理（管理者）
# ================================================================
@router.get("/xp/list")
def get_xp_list(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT u.id, u.username, u.role,
               COALESCE(x.xp,0)     AS xp,
               COALESCE(x.level,1)  AS level,
               COALESCE(x.streak,0) AS streak
        FROM users u
        LEFT JOIN user_xp x ON x.username = u.username
        ORDER BY COALESCE(x.xp,0) DESC
    """)).fetchall()
    return ok(rows_to_list(rows))


@router.post("/xp/grant")
def grant_xp(body: XPManage, db=Depends(get_db), admin=Depends(require_admin)):
    if body.amount <= 0:
        err(E.INVALID_INPUT, "配布量は1以上にしてください")
    if not db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": body.username}).fetchone():
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    xp_row = db.execute(text("SELECT xp FROM user_xp WHERE username = :u"), {"u": body.username}).fetchone()
    new_xp, new_level = _update_xp(db, body.username, (xp_row.xp if xp_row else 0) + body.amount)
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'XP配布', :d)"),
        {"a": admin.username, "d": f"{body.username} +{body.amount}XP ({body.reason})"},
    )
    return ok({"message": f"{body.amount}XPを配布しました", "new_xp": new_xp, "new_level": new_level})


@router.post("/xp/revoke")
def revoke_xp(body: XPManage, db=Depends(get_db), admin=Depends(require_admin)):
    if body.amount <= 0:
        err(E.INVALID_INPUT, "没収量は1以上にしてください")
    xp_row = db.execute(text("SELECT xp FROM user_xp WHERE username = :u"), {"u": body.username}).fetchone()
    new_xp, new_level = _update_xp(db, body.username, max(0, (xp_row.xp if xp_row else 0) - body.amount))
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'XP没収', :d)"),
        {"a": admin.username, "d": f"{body.username} -{body.amount}XP ({body.reason})"},
    )
    return ok({"message": f"{body.amount}XPを没収しました", "new_xp": new_xp, "new_level": new_level})


@router.post("/xp/reset")
def reset_xp(body: XPManage, db=Depends(get_db), admin=Depends(require_admin)):
    _update_xp(db, body.username, 0)
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'XPリセット', :d)"),
        {"a": admin.username, "d": f"{body.username} ({body.reason})"},
    )
    return ok({"message": f"{body.username} のXPをリセットしました"})


# ================================================================
# 称号管理（管理者）
# ================================================================
@router.get("/titles/list")
def get_titles_list(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT id, username, selected_title, selected_title_a, selected_title_b
        FROM users ORDER BY username
    """)).fetchall()
    return ok(rows_to_list(rows))


@router.post("/titles/grant")
def grant_title(body: TitleManage, db=Depends(get_db), admin=Depends(require_admin)):
    if not db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": body.username}).fetchone():
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    new_title = f"{body.title_a} {body.title_b}".strip()
    db.execute(text("""
        UPDATE users
        SET selected_title=:t, selected_title_a=:a, selected_title_b=:b
        WHERE username=:u
    """), {"t": new_title, "a": body.title_a, "b": body.title_b, "u": body.username})
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, '称号付与', :d)"),
        {"a": admin.username, "d": f"{body.username} → {new_title} ({body.reason})"},
    )
    return ok({"message": "称号を設定しました", "title": new_title})


@router.post("/titles/revoke")
def revoke_title(body: TitleManage, db=Depends(get_db), admin=Depends(require_admin)):
    if not db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": body.username}).fetchone():
        err(E.NOT_FOUND, "ユーザーが見つかりません", 404)
    db.execute(text("""
        UPDATE users
        SET selected_title='', selected_title_a='', selected_title_b=''
        WHERE username=:u
    """), {"u": body.username})
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, '称号削除', :d)"),
        {"a": admin.username, "d": f"{body.username} 称号削除 ({body.reason})"},
    )
    return ok({"message": f"{body.username} の称号を削除しました"})


# ================================================================
# ガチャ
# ================================================================
@router.get("/gacha/inventory")
def get_gacha_inventory(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT type, rarity, text FROM gacha_inventory WHERE username = :u ORDER BY created_at"),
        {"u": current_user.username},
    ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/gacha/roll")
def gacha_roll(
    body: GachaRollRequest,
    request: Request,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    check_rate_limit(f"gacha:{current_user.username}", *RATE["gacha"])
    if body.count not in (1, 10):
        err(E.INVALID_INPUT, "count は 1 または 10 のみ")
    cost = 50 if body.count == 1 else 450

    xp_row      = db.execute(text("SELECT xp FROM user_xp WHERE username = :u"), {"u": current_user.username}).fetchone()
    current_xp  = xp_row.xp if xp_row else 0
    if current_xp < cost:
        err(E.XP_INSUFFICIENT, f"XPが足りません（必要：{cost}XP、所持：{current_xp}XP）")

    existing_a = {r.text for r in db.execute(
        text("SELECT text FROM gacha_inventory WHERE username=:u AND type='A'"),
        {"u": current_user.username},
    ).fetchall()}
    existing_b = {r.text for r in db.execute(
        text("SELECT text FROM gacha_inventory WHERE username=:u AND type='B'"),
        {"u": current_user.username},
    ).fetchall()}

    dup_count = 0
    results   = []
    for r in body.results:
        text_a = r.get("textA", "")
        text_b = r.get("textB", "")
        dup_a  = text_a in existing_a
        dup_b  = text_b in existing_b
        if not dup_a:
            db.execute(
                text("INSERT INTO gacha_inventory (username,type,rarity,text) VALUES (:u,'A',:r,:t)"),
                {"u": current_user.username, "r": r.get("rarityA", "N"), "t": text_a},
            )
            existing_a.add(text_a)
        else:
            dup_count += 1
        if not dup_b:
            db.execute(
                text("INSERT INTO gacha_inventory (username,type,rarity,text) VALUES (:u,'B',:r,:t)"),
                {"u": current_user.username, "r": r.get("rarityB", "N"), "t": text_b},
            )
            existing_b.add(text_b)
        else:
            dup_count += 1
        results.append({"dupA": dup_a, "dupB": dup_b})

    new_xp, new_level = _update_xp(db, current_user.username, current_xp - cost + dup_count)
    return ok({"new_xp": new_xp, "new_level": new_level, "dup_count": dup_count, "results": results})


@router.get("/gacha/inventory/admin/{username}")
def get_user_gacha_inventory(username: str, db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(
        text("SELECT type, rarity, text, created_at FROM gacha_inventory WHERE username=:u ORDER BY type, rarity"),
        {"u": username},
    ).fetchall()
    return ok(rows_to_list(rows))


@router.delete("/gacha/inventory/admin/{username}")
def clear_user_gacha_inventory(username: str, db=Depends(get_db), admin=Depends(require_admin)):
    db.execute(text("DELETE FROM gacha_inventory WHERE username=:u"), {"u": username})
    db.execute(
        text("INSERT INTO logs (username, action, detail) VALUES (:a, 'ガチャINV削除', :d)"),
        {"a": admin.username, "d": f"{username}のインベントリをクリア"},
    )
    return ok({"message": f"{username} のインベントリをクリアしました"})


# ================================================================
# 運勢
# ================================================================
_FORTUNE_TABLE: list[dict] = [
    {"rank": "大吉", "xp": 50, "weight":  5, "msgs": ["今日は最高の一日。全力でいこう。", "絶好調の予感。チャンスをつかもう。", "いい一日になりそうだ。"]},
    {"rank": "中吉", "xp": 20, "weight": 20, "msgs": ["いい感じの一日になりそう。", "ほどよく順調。無理せず進もう。", "なんとなく調子がいい日。"]},
    {"rank": "小吉", "xp": 10, "weight": 30, "msgs": ["まあまあの一日。コツコツやろう。", "小さな幸運が積み重なる日。", "地道な努力が実を結ぶ兆し。"]},
    {"rank": "吉",   "xp":  5, "weight": 25, "msgs": ["普通に良い日。平和が一番。", "特別なことはないが安定した日。", "焦らずのんびりいこう。"]},
    {"rank": "末吉", "xp":  2, "weight": 12, "msgs": ["今日は慎重に。でも諦めないで。", "ちょっと注意が必要な日かも。", "下積みの日。明日への糧にしよう。"]},
    {"rank": "凶",   "xp":  1, "weight":  6, "msgs": ["厳しい一日かも。でも乗り越えろ。", "逆境こそ成長のチャンス。", "今日を乗り切れば明日は良くなる。"]},
    {"rank": "大凶", "xp":  0, "weight":  2, "msgs": ["底を打ったら後は上がるだけ。", "大凶を引いた勇者。伝説の幕開け。", "珍しい一日。記念日にしよう。"]},
]
_FORTUNE_TOTAL: int = sum(f["weight"] for f in _FORTUNE_TABLE)


@router.get("/fortune/today")
def get_fortune_today(db=Depends(get_db), current_user=Depends(get_current_user)):
    today = date.today().isoformat()
    seed  = sum(ord(c) for c in f"{current_user.username}-{today}-fortune")
    rng   = random.Random(seed)
    r     = rng.randint(0, _FORTUNE_TOTAL - 1)

    fortune    = _FORTUNE_TABLE[-1]
    cumulative = 0
    for f in _FORTUNE_TABLE:
        cumulative += f["weight"]
        if r < cumulative:
            fortune = f
            break
    msg = rng.choice(fortune["msgs"])

    xp_row  = db.execute(
        text("SELECT xp, fortune_date FROM user_xp WHERE username=:u"),
        {"u": current_user.username},
    ).fetchone()
    already   = bool(xp_row and xp_row.fortune_date == today)
    xp_gained = 0
    if not already and fortune["xp"] > 0:
        new_xp = (xp_row.xp if xp_row else 0) + fortune["xp"]
        new_lv = calc_level(new_xp)
        db.execute(text("""
            INSERT INTO user_xp (username, xp, level, fortune_date)
            VALUES (:u, :xp, :lv, :fd)
            ON CONFLICT (username) DO UPDATE SET xp=:xp, level=:lv, fortune_date=:fd
        """), {"u": current_user.username, "xp": new_xp, "lv": new_lv, "fd": today})
        xp_gained = fortune["xp"]

    return ok({
        "rank":          fortune["rank"],
        "msg":           msg,
        "xp":            fortune["xp"],
        "xp_gained":     xp_gained,
        "already_gained": already,
    })
