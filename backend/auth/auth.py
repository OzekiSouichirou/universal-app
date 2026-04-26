"""
Polonix v0.9.7 - 認証層（JWT + bcrypt）
- datetime.now(timezone.utc) による UTC タイムゾーン明示
- python-jose のセキュアな署名・検証
- bcrypt ラウンド数 12（デフォルト）
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from dotenv import load_dotenv
from jose import JWTError, jwt

from response import E, err

load_dotenv()
logger = logging.getLogger("polonix.auth")

# ----------------------------------------------------------------
# シークレット
# ----------------------------------------------------------------
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY:
    # 開発用フォールバック。本番では必ず環境変数で設定する。
    SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning(
        "SECRET_KEY が未設定です。一時的なランダムキーを生成しました。"
        "本番ではプロセス再起動でトークンが全て無効になるため、必ず環境変数で設定してください。"
    )

ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "180"))
REMEMBER_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7日


# ----------------------------------------------------------------
# パスワードハッシュ
# ----------------------------------------------------------------
def hash_password(plain: str) -> str:
    """パスワードを bcrypt でハッシュ化する。"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """平文パスワードとハッシュを比較する。例外は False で返す。"""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ----------------------------------------------------------------
# JWT 発行・検証
# ----------------------------------------------------------------
def create_access_token(data: dict[str, Any], remember: bool = False) -> str:
    """
    アクセストークンを発行する。
    remember=True で 7 日、False で ACCESS_TOKEN_EXPIRE_MINUTES（既定 180 分）。
    """
    minutes = REMEMBER_TOKEN_EXPIRE_MINUTES if remember else ACCESS_TOKEN_EXPIRE_MINUTES
    payload = {
        **data,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
        "iat": datetime.now(timezone.utc),
        "remember": remember,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    トークンを検証してペイロードを返す。
    無効・期限切れの場合は HTTPException(401) を送出する。
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        logger.warning("Token decode failed: %s", e)
        err(E.UNAUTHORIZED, "認証トークンが無効または期限切れです", status=401)
