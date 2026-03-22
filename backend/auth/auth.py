"""
Polonix v0.9.0 - 認証ユーティリティ
"""
import bcrypt
import os
import logging
from jose import jwt, JWTError
from datetime import datetime, timedelta
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

logger = logging.getLogger("polonix.auth")

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    logger.warning("SECRET_KEY が未設定です。本番環境では必ず設定してください。")
    SECRET_KEY = "polonix-dev-secret-change-in-production"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES     = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 180))
REMEMBER_TOKEN_EXPIRE_MINUTES   = 60 * 24 * 7  # 7日

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, remember: bool = False) -> str:
    to_encode = data.copy()
    minutes = REMEMBER_TOKEN_EXPIRE_MINUTES if remember else ACCESS_TOKEN_EXPIRE_MINUTES
    expire = datetime.utcnow() + timedelta(minutes=minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        logger.warning(f"Token decode failed: {e}")
        raise HTTPException(
            status_code=401,
            detail={"success": False, "error": {
                "code": "UNAUTHORIZED", "message": "認証トークンが無効または期限切れです"
            }}
        )
