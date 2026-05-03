"""Polonix v0.9.7 - 認証ルート"""
from __future__ import annotations

import logging
import random
import string

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text

from auth.auth import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    hash_password,
    verify_password,
)
from models.database import get_db
from pydantic import BaseModel
from response import E, err, ok
from security import RATE, check_rate_limit, validate_password, validate_username

try:
    from jose import JWTError, jwt
except ImportError:
    from python_jose import JWTError, jwt  # type: ignore

router = APIRouter()
logger = logging.getLogger("polonix.auth")
_bearer = HTTPBearer()


# ================================================================
# Pydantic スキーマ
# ================================================================
class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = False


class RegisterBody(BaseModel):
    username: str
    password: str


# ================================================================
# エンドポイント
# ================================================================
@router.post("/login")
def login(body: LoginBody, request: Request, db=Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"login:{ip}", *RATE["login"])

    row = db.execute(
        text("SELECT id, username, hashed_password, role, is_banned FROM users WHERE username = :u"),
        {"u": body.username},
    ).fetchone()

    if not row or not verify_password(body.password, row.hashed_password):
        logger.warning("Login failed: %s from %s", body.username, ip)
        db.execute(
            text("INSERT INTO logs (username, action, detail) VALUES (:u, 'ログイン失敗', :d)"),
            {"u": body.username, "d": f"IP: {ip}"},
        )
        db.commit()
        err(E.AUTH_FAILED, "ユーザー名またはパスワードが違います", 401)

    if row.is_banned:
        err(E.BANNED, "このアカウントは利用停止されています", 403)

    token = create_access_token({"sub": row.username}, remember=body.remember)
    logger.info("Login success: %s", row.username)
    return ok({"access_token": token, "token_type": "bearer", "username": row.username, "role": row.role})


@router.post("/register")
def register(body: RegisterBody, request: Request, db=Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"register:{ip}", *RATE["register"])

    username = validate_username(body.username)
    validate_password(body.password)

    if db.execute(text("SELECT id FROM users WHERE username = :u"), {"u": username}).fetchone():
        err(E.DUPLICATE, "このユーザー名は既に使用されています")

    uid = "#" + "".join(random.choices(string.digits, k=8))
    db.execute(
        text("INSERT INTO users (username, hashed_password, role, user_id) VALUES (:u, :p, 'user', :uid)"),
        {"u": username, "p": hash_password(body.password), "uid": uid},
    )
    db.execute(
        text("INSERT INTO logs (username, action) VALUES (:u, '新規登録')"),
        {"u": username},
    )
    token = create_access_token({"sub": username})
    logger.info("Register: %s", username)
    return ok({"access_token": token, "token_type": "bearer", "username": username, "role": "user"})


@router.post("/refresh")
def refresh(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db=Depends(get_db),
):
    """有効なトークンを受け取り、期限を延長した新トークンを返す。"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        err(E.UNAUTHORIZED, "トークンが無効です", 401)

    username: str = payload.get("sub", "")
    remember: bool = payload.get("remember", False)

    row = db.execute(
        text("SELECT username, is_banned FROM users WHERE username = :u"),
        {"u": username},
    ).fetchone()
    if not row:
        err(E.UNAUTHORIZED, "ユーザーが見つかりません", 401)
    if row.is_banned:
        err(E.BANNED, "このアカウントは利用停止されています", 403)

    new_token = create_access_token({"sub": username}, remember=remember)
    logger.info("Token refreshed: %s", username)
    return ok({"access_token": new_token, "token_type": "bearer"})
