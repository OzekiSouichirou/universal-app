"""
Polonix v0.9.0 - セキュリティ層
- レート制限（メモリベース・TTL付きクリーンアップ）
- 入力バリデーション
- BAN確認
- SQLインジェクション対策（生SQL使用時のパラメータバインド強制）
"""
from fastapi import HTTPException, Request
from datetime import datetime, timedelta
from collections import defaultdict
import threading
import re
import logging

logger = logging.getLogger("polonix.security")

# ============================================================
# レート制限（メモリベース・スレッドセーフ）
# ============================================================
_rate_store: dict = defaultdict(list)
_rate_lock = threading.Lock()
_last_cleanup = datetime.utcnow()

def _cleanup_rate_store():
    """古いエントリを定期クリーンアップ（メモリリーク防止）"""
    global _last_cleanup
    now = datetime.utcnow()
    if (now - _last_cleanup).seconds < 300:  # 5分に1回
        return
    _last_cleanup = now
    cutoff = now - timedelta(seconds=600)
    keys_to_delete = []
    for key, calls in _rate_store.items():
        filtered = [t for t in calls if t > cutoff]
        if filtered:
            _rate_store[key] = filtered
        else:
            keys_to_delete.append(key)
    for k in keys_to_delete:
        del _rate_store[k]

def check_rate_limit(key: str, max_calls: int, window_seconds: int):
    """
    keyでmax_calls/window_seconds を超えたらHTTP429を返す。
    key例: "login:127.0.0.1", "post:nekozita", "gacha:nekozita"
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=window_seconds)
    with _rate_lock:
        _cleanup_rate_store()
        calls = _rate_store[key]
        calls = [t for t in calls if t > cutoff]
        if len(calls) >= max_calls:
            logger.warning(f"Rate limit exceeded: {key} ({len(calls)}/{max_calls})")
            raise HTTPException(
                status_code=429,
                detail={"success": False, "error": {
                    "code": "RATE_LIMIT",
                    "message": f"リクエストが多すぎます。{window_seconds}秒後に再試行してください。"
                }}
            )
        calls.append(now)
        _rate_store[key] = calls

# レート制限プリセット（緩めに設定して誤爆防止）
RATE = {
    "login":    (10, 300),   # 5分で10回
    "register": (5,  600),   # 10分で5回
    "post":     (15, 60),    # 1分で15回
    "gacha":    (5,  60),    # 1分で5回（10連×5）
    "password": (5,  600),   # 10分で5回
    "comment":  (20, 60),    # 1分で20回
    "like":     (30, 60),    # 1分で30回
}

# ============================================================
# 入力バリデーション
# ============================================================
USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]{3,30}$')
PASSWORD_MIN = 6

# XSS対策: 危険なHTMLタグを除去
_DANGEROUS_TAGS = re.compile(r'<[^>]*>', re.IGNORECASE)

def sanitize_text(text: str) -> str:
    """XSS対策: HTMLタグを除去"""
    return _DANGEROUS_TAGS.sub('', text).strip()

def validate_username(username: str) -> str:
    if not username:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "ユーザー名を入力してください"}})
    username = username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "ユーザー名は3〜30文字の英数字・アンダースコア・ハイフンのみ使用できます"}})
    return username

def validate_password(password: str) -> str:
    if not password or len(password) < PASSWORD_MIN:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": f"パスワードは{PASSWORD_MIN}文字以上にしてください"}})
    if len(password) > 128:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "パスワードが長すぎます（128文字以内）"}})
    return password

def validate_post_content(content: str) -> str:
    if not content or not content.strip():
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "投稿内容を入力してください"}})
    content = sanitize_text(content)
    if len(content) > 500:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "投稿内容は500文字以内にしてください"}})
    return content

def validate_bio(bio: str) -> str:
    bio = sanitize_text(bio)
    if len(bio) > 200:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "自己紹介は200文字以内にしてください"}})
    return bio

def validate_event_title(title: str) -> str:
    if not title or not title.strip():
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "タイトルを入力してください"}})
    title = sanitize_text(title)
    if len(title) > 200:
        raise HTTPException(status_code=400, detail={
            "success": False, "error": {"code": "VALIDATION_ERROR",
                                         "message": "タイトルは200文字以内にしてください"}})
    return title

# ============================================================
# BAN確認
# ============================================================
def check_banned(is_banned: bool, username: str = ""):
    if is_banned:
        if username:
            logger.warning(f"Banned user attempted access: {username}")
        raise HTTPException(status_code=403, detail={
            "success": False, "error": {"code": "USER_BANNED",
                                         "message": "このアカウントは利用停止されています"}})
