"""Polonix v0.9.3 - 認証ルート"""
import os, sys, string, random, logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from pydantic import BaseModel
from models.database import get_db
from auth.auth import verify_password, hash_password, create_access_token, decode_token, SECRET_KEY, ALGORITHM
from response import ok, err, E
from security import check_rate_limit, RATE, validate_username, validate_password
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from datetime import datetime

router = APIRouter()
logger = logging.getLogger("polonix.auth")
security = HTTPBearer()

class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = False

class RegisterBody(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(body: LoginBody, request: Request, db=Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"login:{client_ip}", *RATE["login"])

    row = db.execute(
        text("SELECT id, username, hashed_password, role, is_banned FROM users WHERE username=:u"),
        {"u": body.username}
    ).fetchone()

    if not row or not verify_password(body.password, row.hashed_password):
        logger.warning(f"Login failed: {body.username} from {client_ip}")
        db.execute(
            text("INSERT INTO logs (username,action,detail) VALUES (:u,'ログイン失敗',:d)"),
            {"u": body.username, "d": f"IP: {client_ip}"}
        )
        db.commit()
        err(E.AUTH_FAILED, "ユーザー名またはパスワードが違います", 401)

    if row.is_banned:
        err(E.BANNED, "このアカウントは利用停止されています", 403)

    token = create_access_token({"sub": row.username}, remember=body.remember)
    logger.info(f"Login success: {row.username}")
    return ok({"access_token": token, "token_type": "bearer",
               "username": row.username, "role": row.role})

@router.post("/register")
def register(body: RegisterBody, request: Request, db=Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"register:{client_ip}", *RATE["register"])

    validate_username(body.username)
    validate_password(body.password)

    existing = db.execute(
        text("SELECT id FROM users WHERE username=:u"), {"u": body.username}
    ).fetchone()
    if existing:
        err(E.DUPLICATE, "このユーザー名は既に使用されています")

    uid = "#" + "".join(random.choices(string.digits, k=8))
    db.execute(
        text("INSERT INTO users (username,hashed_password,role,user_id) VALUES (:u,:p,'user',:uid)"),
        {"u": body.username, "p": hash_password(body.password), "uid": uid}
    )
    db.execute(
        text("INSERT INTO logs (username,action) VALUES (:u,'新規登録')"), {"u": body.username}
    )
    token = create_access_token({"sub": body.username})
    logger.info(f"Register: {body.username}")
    return ok({"access_token": token, "token_type": "bearer",
               "username": body.username, "role": "user"})

@router.post("/refresh")
def refresh(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db=Depends(get_db)
):
    """有効なトークンを受け取り、期限を延長した新トークンを発行"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        err(E.UNAUTHORIZED, "トークンが無効です", 401)

    username = payload.get("sub")
    remember = payload.get("remember", False)

    # ユーザーが存在しBANされていないか確認
    row = db.execute(
        text("SELECT username, role, is_banned FROM users WHERE username=:u"),
        {"u": username}
    ).fetchone()
    if not row:
        err(E.UNAUTHORIZED, "ユーザーが見つかりません", 401)
    if row.is_banned:
        err(E.BANNED, "このアカウントは利用停止されています", 403)

    new_token = create_access_token({"sub": username}, remember=remember)
    logger.info(f"Token refreshed: {username}")
    return ok({"access_token": new_token, "token_type": "bearer"})
