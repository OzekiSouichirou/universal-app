import bcrypt
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, User, Log, GachaInventory
from auth.auth import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter()
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        payload = decode_token(credentials.credentials)
        user = db.query(User).filter(User.username == payload["sub"]).first()
        if not user:
            raise HTTPException(status_code=401, detail="認証エラー")
        return user
    except:
        raise HTTPException(status_code=401, detail="認証エラー")

def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="管理者権限が必要です")
    return current_user

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

class RoleUpdate(BaseModel):
    role: str

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class AvatarUpdate(BaseModel):
    avatar: str

# /me系を先に定義（/{user_id}より前に置かないとルート衝突する）

@router.get("/avatars")
def get_avatars(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).all()
    return {u.username: u.avatar for u in users}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy import text
    # getattr経由ではSQLAlchemyキャッシュの問題があるため生SQLで取得
    row = db.execute(
        text("SELECT bio, selected_title, selected_title_a, selected_title_b, selected_badges FROM users WHERE id = :id"),
        {"id": current_user.id}
    ).fetchone()
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "avatar": current_user.avatar,
        "user_id": current_user.user_id,
        "bio": (row.bio or "") if row else "",
        "selected_title": (row.selected_title or "") if row else "",
        "selected_title_a": (row.selected_title_a or "") if row else "",
        "selected_title_b": (row.selected_title_b or "") if row else "",
        "selected_badges": (row.selected_badges or "[]") if row else "[]",
        "created_at": current_user.created_at
    }

@router.patch("/me/password")
def change_password(body: PasswordUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not bcrypt.checkpw(body.current_password.encode("utf-8"), current_user.hashed_password.encode("utf-8")):
        raise HTTPException(status_code=400, detail="現在のパスワードが違います")
    current_user.hashed_password = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.add(Log(username=current_user.username, action="パスワード変更"))
    db.commit()
    return {"message": "パスワードを変更しました"}

@router.patch("/me/avatar")
def update_avatar(body: AvatarUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not body.avatar.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="無効な画像データです")
    if len(body.avatar) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="画像サイズが大きすぎます（上限1MB）")
    current_user.avatar = body.avatar
    db.add(Log(username=current_user.username, action="アバター更新"))
    db.commit()
    return {"message": "アバターを更新しました"}

@router.delete("/me/avatar")
def delete_avatar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.avatar = None
    db.add(Log(username=current_user.username, action="アバター削除"))
    db.commit()
    return {"message": "アバターを削除しました"}

@router.delete("/me")
def delete_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.add(Log(username=current_user.username, action="アカウント削除"))
    db.delete(current_user)
    db.commit()
    return {"message": "アカウントを削除しました"}

# /{user_id}系は後に定義

@router.get("/")
def get_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "role": u.role, "avatar": u.avatar, "user_id": u.user_id, "created_at": u.created_at} for u in users]

@router.post("/")
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="既に存在するユーザー名です")
    hashed = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(username=body.username, hashed_password=hashed, role=body.role)
    db.add(user)
    db.add(Log(username=admin.username, action="ユーザー追加", detail=f"{body.username}（{body.role}）"))
    db.commit()
    return {"message": "ユーザーを作成しました"}

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if user.role == "admin" and user.username == "admin":
        raise HTTPException(status_code=400, detail="メイン管理者は削除できません")
    db.add(Log(username=admin.username, action="ユーザー削除", detail=user.username))
    db.delete(user)
    db.commit()
    return {"message": "ユーザーを削除しました"}

@router.patch("/{user_id}/role")
def update_role(user_id: int, body: RoleUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    db.add(Log(username=admin.username, action="権限変更", detail=f"{user.username} → {body.role}"))
    user.role = body.role
    db.commit()
    return {"message": "権限を変更しました"}
@router.post("/admin/cleanup-orphan-data")
def cleanup_orphan_data(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """存在しないユーザーの孤立データを全削除する（管理者専用）"""
    from models.database import Post, Like, Comment, Notification, CalendarEvent, Timetable, UserXP, Feedback

    existing = db.query(User.username).all()
    existing_names = {row[0] for row in existing}

    deleted = {}

    # 各テーブルから孤立データを削除
    for model, label in [
        (CalendarEvent, "calendar_events"),
        (Timetable, "timetable"),
        (UserXP, "user_xp"),
        (Feedback, "feedback"),
    ]:
        rows = db.query(model).all()
        orphans = [r for r in rows if r.username not in existing_names]
        for r in orphans:
            db.delete(r)
        deleted[label] = len(orphans)

    # 投稿系
    orphan_posts = db.query(Post).filter(Post.username.notin_(existing_names)).all()
    orphan_post_ids = [p.id for p in orphan_posts]
    if orphan_post_ids:
        db.query(Like).filter(Like.post_id.in_(orphan_post_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.post_id.in_(orphan_post_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.post_id.in_(orphan_post_ids)).delete(synchronize_session=False)
    db.query(Post).filter(Post.username.notin_(existing_names)).delete(synchronize_session=False)
    deleted["posts"] = len(orphan_posts)

    db.query(Like).filter(Like.username.notin_(existing_names)).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.username.notin_(existing_names)).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.username.notin_(existing_names)).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.from_username.notin_(existing_names)).delete(synchronize_session=False)

    db.add(Log(username=admin.username, action="孤立データ削除", detail=str(deleted)))
    db.commit()
    return {"message": "クリーンアップ完了", "deleted": deleted}


# ===================== XP管理（管理者） =====================
class XPManage(BaseModel):
    username: str
    amount: int
    reason: str = ""

@router.get("/xp/list")
def get_xp_list(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """全ユーザーのXP一覧（管理者専用）"""
    from models.database import UserXP
    users = db.query(User).all()
    xp_rows = {x.username: x for x in db.query(UserXP).all()}
    result = []
    for u in users:
        xp = xp_rows.get(u.username)
        result.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "xp": xp.xp if xp else 0,
            "level": xp.level if xp else 1,
            "streak": xp.streak if xp else 0,
        })
    return sorted(result, key=lambda x: x["xp"], reverse=True)

@router.post("/xp/grant")
def grant_xp(body: XPManage, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """XPを配布する（管理者専用）"""
    from models.database import UserXP
    target = db.query(User).filter(User.username == body.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="配布量は1以上にしてください")

    xp_row = db.query(UserXP).filter(UserXP.username == body.username).first()
    if not xp_row:
        xp_row = UserXP(username=body.username, xp=0, level=1, streak=0)
        db.add(xp_row)
    xp_row.xp += body.amount
    # レベル再計算
    LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000]
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp_row.xp >= LEVEL_THRESHOLDS[i]:
            xp_row.level = i + 1
            break
    db.add(Log(username=admin.username, action="XP配布",
               detail=f"{body.username} に +{body.amount}XP（{body.reason}）"))
    db.commit()
    return {"message": f"{body.username} に {body.amount}XP を配布しました", "new_xp": xp_row.xp, "new_level": xp_row.level}

@router.post("/xp/revoke")
def revoke_xp(body: XPManage, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """XPを没収する（管理者専用）"""
    from models.database import UserXP
    target = db.query(User).filter(User.username == body.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="没収量は1以上にしてください")

    xp_row = db.query(UserXP).filter(UserXP.username == body.username).first()
    if not xp_row:
        raise HTTPException(status_code=404, detail="XPデータがありません")
    xp_row.xp = max(0, xp_row.xp - body.amount)
    LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000]
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp_row.xp >= LEVEL_THRESHOLDS[i]:
            xp_row.level = i + 1
            break
    db.add(Log(username=admin.username, action="XP没収",
               detail=f"{body.username} から -{body.amount}XP（{body.reason}）"))
    db.commit()
    return {"message": f"{body.username} から {body.amount}XP を没収しました", "new_xp": xp_row.xp, "new_level": xp_row.level}

@router.post("/xp/reset")
def reset_xp(body: XPManage, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """XPを0にリセット（管理者専用）"""
    from models.database import UserXP
    target = db.query(User).filter(User.username == body.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    xp_row = db.query(UserXP).filter(UserXP.username == body.username).first()
    if xp_row:
        xp_row.xp = 0
        xp_row.level = 1
    db.add(Log(username=admin.username, action="XPリセット",
               detail=f"{body.username} のXPをリセット（{body.reason}）"))
    db.commit()
    return {"message": f"{body.username} のXPをリセットしました"}


# ===================== プロフィール強化 =====================
class ProfileUpdate(BaseModel):
    bio: str = ""
    selected_title: str = ""
    selected_title_a: str = ""
    selected_title_b: str = ""
    selected_badges: str = "[]"

@router.patch("/me/profile")
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import text
    if len(body.bio) > 200:
        raise HTTPException(status_code=400, detail="自己紹介文は200文字以内にしてください")

    # 生SQLで直接UPDATE（SQLAlchemyキャッシュ問題を完全回避）
    try:
        db.execute(text("""
            UPDATE users
            SET bio = :bio,
                selected_title = :selected_title,
                selected_title_a = :selected_title_a,
                selected_title_b = :selected_title_b,
                selected_badges = :selected_badges
            WHERE id = :user_id
        """), {
            "bio": body.bio,
            "selected_title": body.selected_title,
            "selected_title_a": body.selected_title_a,
            "selected_title_b": body.selected_title_b,
            "selected_badges": body.selected_badges,
            "user_id": current_user.id,
        })
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"保存に失敗しました: {e}")

    # 保存後の値を生SQLで取得して返す
    row = db.execute(
        text("SELECT selected_title, selected_title_a, selected_title_b FROM users WHERE id = :id"),
        {"id": current_user.id}
    ).fetchone()

    return {
        "message": "プロフィールを更新しました",
        "selected_title": (row.selected_title or "") if row else "",
        "selected_title_a": (row.selected_title_a or "") if row else "",
        "selected_title_b": (row.selected_title_b or "") if row else "",
    }

@router.get("/profile/{username}")
def get_user_profile(username: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """他ユーザーのプロフィールを取得"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    from models.database import UserXP, Post
    from sqlalchemy import text
    xp_row = db.query(UserXP).filter(UserXP.username == username).first()
    post_count = db.query(Post).filter(Post.username == username).count()
    row = db.execute(
        text("SELECT bio, selected_title, selected_title_a, selected_title_b, selected_badges FROM users WHERE id = :id"),
        {"id": user.id}
    ).fetchone()
    return {
        "username": user.username,
        "user_id": user.user_id,
        "avatar": user.avatar,
        "bio": (row.bio or "") if row else "",
        "selected_title": (row.selected_title or "") if row else "",
        "selected_title_a": (row.selected_title_a or "") if row else "",
        "selected_title_b": (row.selected_title_b or "") if row else "",
        "selected_badges": (row.selected_badges or "[]") if row else "[]",
        "role": user.role,
        "created_at": user.created_at,
        "xp": xp_row.xp if xp_row else 0,
        "level": xp_row.level if xp_row else 1,
        "streak": xp_row.streak if xp_row else 0,
        "post_count": post_count,
    }


# ===================== ガチャかぶりボーナス =====================
@router.post("/gacha/duplicate-bonus")
def gacha_duplicate_bonus(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """ガチャかぶり時に1XPを付与"""
    from models.database import UserXP
    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    if not xp_row:
        xp_row = UserXP(username=current_user.username, xp=0, level=1, streak=0)
        db.add(xp_row)
    xp_row.xp += 1
    LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000]
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp_row.xp >= LEVEL_THRESHOLDS[i]:
            xp_row.level = i + 1
            break
    db.commit()
    return {"message": "かぶりボーナス +1XP", "new_xp": xp_row.xp}


# ===================== 称号管理（管理者） =====================
class TitleManage(BaseModel):
    username: str
    title_a: str = ""
    title_b: str = ""
    reason: str = ""

@router.get("/titles/list")
def get_titles_list(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """全ユーザーの称号一覧（管理者専用）"""
    users = db.query(User).all()
    return [{
        "id": u.id,
        "username": u.username,
        "selected_title": getattr(u, "selected_title", None) or "",
        "selected_title_a": getattr(u, "selected_title_a", None) or "",
        "selected_title_b": getattr(u, "selected_title_b", None) or "",
    } for u in users]

@router.post("/titles/grant")
def grant_title(body: TitleManage, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """称号を管理者が付与する（A・B個別に設定）"""
    target = db.query(User).filter(User.username == body.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    try: target.selected_title_a = body.title_a
    except: pass
    try: target.selected_title_b = body.title_b
    except: pass
    new_title = f"{body.title_a} {body.title_b}".strip() if body.title_a or body.title_b else ""
    try: target.selected_title = new_title
    except: pass
    db.add(Log(username=admin.username, action="称号付与",
               detail=f"{body.username} → {new_title}（{body.reason}）"))
    db.commit()
    return {"message": f"{body.username} に称号を設定しました", "title": new_title}

@router.post("/titles/revoke")
def revoke_title(body: TitleManage, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """称号を管理者が削除する"""
    target = db.query(User).filter(User.username == body.username).first()
    if not target:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    old_title = getattr(target, "selected_title", None) or ""
    try: target.selected_title = ""
    except: pass
    try: target.selected_title_a = ""
    except: pass
    try: target.selected_title_b = ""
    except: pass
    db.add(Log(username=admin.username, action="称号削除",
               detail=f"{body.username} の称号「{old_title}」を削除（{body.reason}）"))
    db.commit()
    return {"message": f"{body.username} の称号を削除しました"}


# ===================== ガチャXP消費 =====================
class GachaSpendXP(BaseModel):
    count: int  # 1 or 10

@router.post("/gacha/spend-xp")
def gacha_spend_xp(body: GachaSpendXP, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """ガチャでXPを消費する。残高不足ならエラー。"""
    from models.database import UserXP
    if body.count not in [1, 10]:
        raise HTTPException(status_code=400, detail="countは1または10のみ")
    cost = 50 if body.count == 1 else 450

    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    if not xp_row:
        raise HTTPException(status_code=400, detail="XPデータがありません")
    if xp_row.xp < cost:
        raise HTTPException(status_code=400, detail=f"XPが足りません（必要：{cost}XP、所持：{xp_row.xp}XP）")

    xp_row.xp -= cost
    # レベル再計算
    LEVEL_THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000]
    for i in range(len(LEVEL_THRESHOLDS)-1,-1,-1):
        if xp_row.xp >= LEVEL_THRESHOLDS[i]:
            xp_row.level = i+1
            break
    db.commit()
    return {"message": "XP消費完了", "new_xp": xp_row.xp, "new_level": xp_row.level}


# ===================== ガチャインベントリ（DB管理） =====================

@router.get("/gacha/inventory")
def get_gacha_inventory(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """自分のガチャインベントリを取得"""
    items = db.query(GachaInventory).filter(
        GachaInventory.username == current_user.username
    ).order_by(GachaInventory.created_at.asc()).all()
    return [{"type": i.type, "rarity": i.rarity, "text": i.text} for i in items]

class GachaRollRequest(BaseModel):
    count: int  # 1 or 10
    results: list  # [{type, rarityA, textA, rarityB, textB}, ...]

@router.post("/gacha/roll")
def gacha_roll(body: GachaRollRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ガチャ実行：XP消費→インベントリ登録→かぶり判定→かぶりXP付与
    フロントで抽選した結果をそのまま送る（乱数はフロント側）
    """
    from models.database import UserXP
    if body.count not in [1, 10]:
        raise HTTPException(status_code=400, detail="countは1または10のみ")
    cost = 50 if body.count == 1 else 450

    # XP残高確認・消費
    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    if not xp_row or xp_row.xp < cost:
        raise HTTPException(status_code=400, detail=f"XPが足りません（必要：{cost}XP、所持：{xp_row.xp if xp_row else 0}XP）")

    xp_row.xp -= cost
    LEVEL_THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000]
    for i in range(len(LEVEL_THRESHOLDS)-1,-1,-1):
        if xp_row.xp >= LEVEL_THRESHOLDS[i]:
            xp_row.level = i+1
            break

    # 既存インベントリを取得してかぶり判定
    existing_a = {i.text for i in db.query(GachaInventory).filter(
        GachaInventory.username == current_user.username,
        GachaInventory.type == 'A'
    ).all()}
    existing_b = {i.text for i in db.query(GachaInventory).filter(
        GachaInventory.username == current_user.username,
        GachaInventory.type == 'B'
    ).all()}

    dup_count = 0
    roll_results = []

    for r in body.results:
        text_a = r.get('textA','')
        text_b = r.get('textB','')
        rarity_a = r.get('rarityA','N')
        rarity_b = r.get('rarityB','N')

        dup_a = text_a in existing_a
        dup_b = text_b in existing_b

        if not dup_a:
            db.add(GachaInventory(username=current_user.username, type='A', rarity=rarity_a, text=text_a))
            existing_a.add(text_a)
        else:
            dup_count += 1

        if not dup_b:
            db.add(GachaInventory(username=current_user.username, type='B', rarity=rarity_b, text=text_b))
            existing_b.add(text_b)
        else:
            dup_count += 1

        roll_results.append({"dupA": dup_a, "dupB": dup_b})

    # かぶりXP付与
    if dup_count > 0:
        xp_row.xp += dup_count
        for i in range(len(LEVEL_THRESHOLDS)-1,-1,-1):
            if xp_row.xp >= LEVEL_THRESHOLDS[i]:
                xp_row.level = i+1
                break

    db.commit()

    return {
        "new_xp": xp_row.xp,
        "new_level": xp_row.level,
        "dup_count": dup_count,
        "results": roll_results
    }

@router.get("/gacha/inventory/admin/{username}")
def get_user_gacha_inventory(username: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """管理者：特定ユーザーのインベントリ取得"""
    items = db.query(GachaInventory).filter(
        GachaInventory.username == username
    ).order_by(GachaInventory.type, GachaInventory.rarity).all()
    return [{"type": i.type, "rarity": i.rarity, "text": i.text, "created_at": i.created_at} for i in items]

@router.delete("/gacha/inventory/admin/{username}")
def clear_user_gacha_inventory(username: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """管理者：特定ユーザーのインベントリをクリア"""
    db.query(GachaInventory).filter(GachaInventory.username == username).delete()
    db.add(Log(username=admin.username, action="ガチャINV削除", detail=f"{username}のインベントリをクリア"))
    db.commit()
    return {"message": f"{username} のインベントリをクリアしました"}


# ===================== 運勢システム =====================
import random as _random
from datetime import date as _date

FORTUNE_TABLE = [
    {"rank": "大吉", "emoji": "🌟", "xp": 50,  "weight": 5,
     "msgs": ["今日は最高の一日！全力で行こう！", "絶好調の予感。チャンスを掴め！", "運気MAX！何でもうまくいく日！"]},
    {"rank": "中吉", "emoji": "✨", "xp": 20,  "weight": 20,
     "msgs": ["いい感じの一日になりそう。", "ほどよく順調。無理せず進もう。", "なんとなくツイてる気がする日。"]},
    {"rank": "小吉", "emoji": "🍀", "xp": 10,  "weight": 30,
     "msgs": ["まあまあの一日。コツコツやろう。", "小さな幸運が積み重なる日。", "地道な努力が実を結ぶ兆し。"]},
    {"rank": "吉",   "emoji": "😊", "xp":  5,  "weight": 25,
     "msgs": ["普通に良い日。平和が一番。", "特別なことはないが安定した日。", "焦らずのんびりいこう。"]},
    {"rank": "末吉", "emoji": "🌱", "xp":  2,  "weight": 12,
     "msgs": ["今日は慎重に。でも諦めないで。", "ちょっと注意が必要な日かも。", "下積みの日。明日への糧にしよう。"]},
    {"rank": "凶",   "emoji": "💦", "xp":  1,  "weight":  6,
     "msgs": ["厳しい一日かも。でも乗り越えろ！", "逆境こそ成長のチャンス！", "今日を乗り切れば明日は良くなる！"]},
    {"rank": "大凶", "emoji": "💀", "xp":  0,  "weight":  2,
     "msgs": ["最悪の予感…でも大凶を引いた勇者！", "底を打ったら後は上がるだけ！", "伝説の大凶！レアすぎる一日！"]},
]

@router.get("/fortune/today")
def get_fortune_today(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """今日の運勢を取得。1日1回のみXPを付与。"""
    from models.database import UserXP

    today = _date.today().isoformat()
    # ユーザーIDと日付でシードを固定→同じ日は同じ運勢
    seed_str = f"{current_user.username}-{today}-fortune"
    seed = sum(ord(c) for c in seed_str)
    rng = _random.Random(seed)

    # 重み付き抽選
    total = sum(f["weight"] for f in FORTUNE_TABLE)
    r = rng.randint(0, total - 1)
    cumulative = 0
    fortune = FORTUNE_TABLE[-1]
    for f in FORTUNE_TABLE:
        cumulative += f["weight"]
        if r < cumulative:
            fortune = f
            break

    msg = rng.choice(fortune["msgs"])

    # XP付与（1日1回）
    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    already_gained = False
    xp_gained = 0

    if xp_row and getattr(xp_row, 'fortune_date', None) == today:
        already_gained = True
    elif fortune["xp"] > 0:
        if not xp_row:
            xp_row = UserXP(username=current_user.username, xp=0, level=1, streak=0)
            db.add(xp_row)
        xp_row.xp += fortune["xp"]
        LEVEL_THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000]
        for i in range(len(LEVEL_THRESHOLDS)-1,-1,-1):
            if xp_row.xp >= LEVEL_THRESHOLDS[i]:
                xp_row.level = i+1
                break
        # fortune_dateカラムがあれば保存
        try:
            xp_row.fortune_date = today
        except Exception:
            pass
        db.commit()
        xp_gained = fortune["xp"]

    return {
        "rank": fortune["rank"],
        "emoji": fortune["emoji"],
        "msg": msg,
        "xp": fortune["xp"],
        "xp_gained": xp_gained,
        "already_gained": already_gained,
    }
