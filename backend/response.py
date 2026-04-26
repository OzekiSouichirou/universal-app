"""
Polonix v0.9.7 - APIレスポンス統一ユーティリティ
全APIは以下の形式で統一する:

  成功: {"success": true,  "data": {...}}
  失敗: {"success": false, "error": {"code": "ERROR_CODE", "message": "..."}}
"""
from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException


# ----------------------------------------------------------------
# 成功レスポンス
# ----------------------------------------------------------------
def ok(data: Any = None) -> dict[str, Any]:
    """成功レスポンスを生成する。"""
    return {"success": True, "data": data if data is not None else {}}


# ----------------------------------------------------------------
# 失敗レスポンス（HTTPException として throw）
# ----------------------------------------------------------------
def err(code: str, message: str, status: int = 400) -> NoReturn:
    """
    失敗レスポンスを HTTPException として送出する。
    status は HTTP ステータスコード。デフォルト 400。
    """
    raise HTTPException(
        status_code=status,
        detail={"success": False, "error": {"code": code, "message": message}},
    )


# ----------------------------------------------------------------
# 標準エラーコード定数
# ----------------------------------------------------------------
class E:
    """よく使うエラーコード定数。"""
    NOT_FOUND       = "NOT_FOUND"
    UNAUTHORIZED    = "UNAUTHORIZED"
    FORBIDDEN       = "FORBIDDEN"
    VALIDATION      = "VALIDATION_ERROR"
    DUPLICATE       = "DUPLICATE"
    INVALID_INPUT   = "INVALID_INPUT"
    DB_ERROR        = "DB_ERROR"
    RATE_LIMIT      = "RATE_LIMIT"
    XP_INSUFFICIENT = "XP_INSUFFICIENT"
    AUTH_FAILED     = "AUTH_FAILED"
    BANNED          = "USER_BANNED"
    INTERNAL        = "INTERNAL_ERROR"
