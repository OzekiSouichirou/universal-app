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

@router.get("/")
def get_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at} for u in users]

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

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "role": current_user.role, "created_at": current_user.created_at}

@router.patch("/me/password")
def change_password(body: PasswordUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not bcrypt.checkpw(body.current_password.encode("utf-8"), current_user.hashed_password.encode("utf-8")):
        raise HTTPException(status_code=400, detail="現在のパスワードが違います")
    current_user.hashed_password = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db.add(Log(username=current_user.username, action="パスワード変更"))
    db.commit()
    return {"message": "パスワードを変更しました"}