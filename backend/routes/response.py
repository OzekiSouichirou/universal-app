"""
Polonix v0.9.0 - APIレスポンス統一ユーティリティ
全APIは以下の形式で統一する:

成功時: {"success": true,  "data": {...}}
失敗時: {"success": false, "error": {"code": "ERROR_CODE", "message": "..."}}
"""
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from typing import Any

def ok(data: Any = None) -> dict:
    """成功レスポンスを生成"""
    return {"success": True, "data": data if data is not None else {}}

def err(code: str, message: str, status: int = 400) -> HTTPException:
    """失敗レスポンスをHTTPExceptionとして生成"""
    raise HTTPException(
        status_code=status,
        detail={"success": False, "error": {"code": code, "message": message}}
    )

# よく使うエラーコード定数
class E:
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
