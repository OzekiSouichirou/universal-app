from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import get_db, User, Log
from auth.auth import verify_password, create_access_token
import bcrypt

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = False

class RegisterRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()

    if not user or not verify_password(request.password, user.hashed_password):
        db.add(Log(username=request.username, action="ログイン失敗", detail="パスワードまたはユーザー名が違います"))
        db.commit()
        raise HTTPException(status_code=401, detail="ユーザー名またはパスワードが違います")

    db.add(Log(username=user.username, action="ログイン成功"))
    db.commit()
    token = create_access_token({"sub": user.username, "role": user.role}, remember=request.remember)
    return {"access_token": token, "token_type": "bearer", "role": user.role}

@router.post("/register")
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    if len(request.username) < 3:
        raise HTTPException(status_code=400, detail="ユーザー名は3文字以上にしてください")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="パスワードは6文字以上にしてください")

    existing = db.query(User).filter(User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="既に使われているユーザー名です")

    hashed = bcrypt.hashpw(request.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(username=request.username, hashed_password=hashed, role="user")
    db.add(user)
    db.add(Log(username=request.username, action="新規登録"))
    db.commit()
    return {"message": "登録が完了しました"}