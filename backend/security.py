"""
Polonix v0.9.7 - セキュリティ層
- レート制限（メモリベース・スレッドセーフ・自動 GC）
- 入力バリデーション
- XSS 対策（HTMLタグ除去）
- BAN 確認
"""
from __future__ import annotations

import logging
import re
import threading
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Final

from response import E, err

logger = logging.getLogger("polonix.security")


# ================================================================
# レート制限
# ================================================================
_RATE_STORE: dict[str, list[datetime]] = defaultdict(list)
_RATE_LOCK = threading.Lock()
_LAST_CLEANUP = datetime.now(timezone.utc)
_CLEANUP_INTERVAL_SEC: Final[int] = 300


def _gc_rate_store() -> None:
    """5分ごとに古いエントリを掃除（メモリリーク防止）。lock 内で呼ぶこと。"""
    global _LAST_CLEANUP
    now = datetime.now(timezone.utc)
    if (now - _LAST_CLEANUP).total_seconds() < _CLEANUP_INTERVAL_SEC:
        return
    _LAST_CLEANUP = now
    cutoff = now - timedelta(seconds=600)
    dead_keys: list[str] = []
    for k, calls in _RATE_STORE.items():
        active = [t for t in calls if t > cutoff]
        if active:
            _RATE_STORE[k] = active
        else:
            dead_keys.append(k)
    for k in dead_keys:
        del _RATE_STORE[k]


def check_rate_limit(key: str, max_calls: int, window_sec: int) -> None:
    """
    レート制限を判定する。超過した場合は 429 を返す。

    :param key: 識別キー（例: "login:127.0.0.1"）
    :param max_calls: window_sec 内に許可する最大呼び出し回数
    :param window_sec: 計測ウィンドウ（秒）
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_sec)
    with _RATE_LOCK:
        _gc_rate_store()
        calls = [t for t in _RATE_STORE[key] if t > cutoff]
        if len(calls) >= max_calls:
            logger.warning("Rate limit exceeded: %s (%d/%d)", key, len(calls), max_calls)
            err(
                E.RATE_LIMIT,
                f"リクエストが多すぎます。{window_sec}秒後に再試行してください。",
                status=429,
            )
        calls.append(now)
        _RATE_STORE[key] = calls


# レート制限プリセット（max_calls, window_sec）
RATE: Final[dict[str, tuple[int, int]]] = {
    "login":    (10, 300),
    "register": (5,  600),
    "post":     (15, 60),
    "gacha":    (5,  60),
    "password": (5,  600),
    "comment":  (20, 60),
    "like":     (30, 60),
}


# ================================================================
# 入力バリデーション
# ================================================================
USERNAME_RE: Final = re.compile(r"^[a-zA-Z0-9_\-]{3,30}$")
PASSWORD_MIN: Final[int] = 6
PASSWORD_MAX: Final[int] = 128

# HTML タグ除去
_HTML_TAG_RE: Final = re.compile(r"<[^>]*>", re.IGNORECASE)


def sanitize_text(s: str) -> str:
    """XSS 対策: HTMLタグを完全除去して trim。"""
    return _HTML_TAG_RE.sub("", s).strip()


def validate_username(username: str) -> str:
    """ユーザー名形式を検証して整形済みの値を返す。"""
    if not username:
        err(E.VALIDATION, "ユーザー名を入力してください")
    s = username.strip()
    if not USERNAME_RE.match(s):
        err(
            E.VALIDATION,
            "ユーザー名は 3〜30 文字の半角英数字・アンダースコア・ハイフンのみ使用できます",
        )
    return s


def validate_password(password: str) -> str:
    """パスワード長を検証する。"""
    if not password or len(password) < PASSWORD_MIN:
        err(E.VALIDATION, f"パスワードは {PASSWORD_MIN} 文字以上にしてください")
    if len(password) > PASSWORD_MAX:
        err(E.VALIDATION, f"パスワードが長すぎます（{PASSWORD_MAX} 文字以内）")
    return password


def validate_post_content(content: str, max_len: int = 500) -> str:
    """投稿本文を検証・サニタイズして返す。"""
    if not content or not content.strip():
        err(E.VALIDATION, "投稿内容を入力してください")
    s = sanitize_text(content)
    if len(s) > max_len:
        err(E.VALIDATION, f"投稿内容は {max_len} 文字以内にしてください")
    return s


def validate_bio(bio: str, max_len: int = 200) -> str:
    """自己紹介文を検証・サニタイズして返す。"""
    s = sanitize_text(bio or "")
    if len(s) > max_len:
        err(E.VALIDATION, f"自己紹介は {max_len} 文字以内にしてください")
    return s


def validate_event_title(title: str, max_len: int = 200) -> str:
    """イベントタイトルを検証・サニタイズして返す。"""
    if not title or not title.strip():
        err(E.VALIDATION, "タイトルを入力してください")
    s = sanitize_text(title)
    if len(s) > max_len:
        err(E.VALIDATION, f"タイトルは {max_len} 文字以内にしてください")
    return s


# ================================================================
# BAN 確認
# ================================================================
def check_banned(is_banned: bool, username: str = "") -> None:
    """is_banned が True の場合 403 を送出する。"""
    if is_banned:
        if username:
            logger.warning("Banned user attempted access: %s", username)
        err(E.BANNED, "このアカウントは利用停止されています", status=403)


# ================================================================
# セキュリティヘッダー（main.py から参照される定数）
# ================================================================
SECURITY_HEADERS: Final[dict[str, str]] = {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
    "Permissions-Policy":      "geolocation=(), microphone=(), camera=()",
    "Cross-Origin-Opener-Policy":   "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
}
