"""
Polonix v0.9.0 - セキュリティ層
- レート制限（メモリベース）
- 入力バリデーション
- BAN確認
"""
from fastapi import HTTPException, Request
from datetime import datetime, timedelta
from collections import defaultdict
import threading
import re

# ============================================================
# レート制限（メモリベース・シンプル実装）
# ============================================================
_rate_store: dict = defaultdict(list)  # {key: [timestamp, ...]}
_rate_lock = threading.Lock()

def check_rate_limit(key: str, max_calls: int, window_seconds: int):
    """
    keyでmax_calls/window_seconds を超えたらHTTP429を返す。
    keyの例: "login:127.0.0.1", "post:nekozita", "gacha:nekozita"
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=window_seconds)
    with _rate_lock:
        calls = _rate_store[key]
        # 古いエントリを削除
        calls = [t for t in calls if t > cutoff]
        if len(calls) >= max_calls:
            raise HTTPException(
                status_code=429,
                detail={"success": False, "error": {
                    "code": "RATE_LIMIT",
                    "message": f"リクエストが多すぎます。{window_seconds}秒後に再試行してください。"
                }}
            )
        calls.append(now)
        _rate_store[key] = calls

# レート制限プリセット
RATE = {
    "login":    (10, 300),   # 5分で10回
    "register": (5,  600),   # 10分で5回
    "post":     (20, 60),    # 1分で20回
    "gacha":    (5, 60),     # 1分で5回（10連×5回）
    "password": (5,  600),   # 10分で5回
}

# ============================================================
# 入力バリデーション
# ============================================================
USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]{3,30}$')
PASSWORD_MIN = 6

def validate_username(username: str) -> str:
    """ユーザー名のバリデーション"""
    if not username:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "ユーザー名を入力してください"}})
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "ユーザー名は3〜30文字の英数字・アンダースコア・ハイフンのみ使用できます"}})
    return username.strip()

def validate_password(password: str) -> str:
    """パスワードのバリデーション"""
    if not password or len(password) < PASSWORD_MIN:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": f"パスワードは{PASSWORD_MIN}文字以上にしてください"}})
    return password

def validate_post_content(content: str) -> str:
    """投稿内容のバリデーション"""
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "投稿内容を入力してください"}})
    if len(content) > 500:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "投稿内容は500文字以内にしてください"}})
    return content.strip()

def validate_bio(bio: str) -> str:
    if len(bio) > 200:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "自己紹介は200文字以内にしてください"}})
    return bio.strip()

# ============================================================
# BAN確認
# ============================================================
def check_banned(is_banned: bool, username: str = ""):
    if is_banned:
        raise HTTPException(status_code=403, detail={
            "success": False, "error": {"code": "USER_BANNED",
                                         "message": "このアカウントは利用停止されています"}})

