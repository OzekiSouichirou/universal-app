import bcrypt
import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, User, Log
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
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "avatar": current_user.avatar,
        "user_id": current_user.user_id,
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
