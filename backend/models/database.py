"""
Polonix v0.9.7 - DB接続層
DigitalOcean Managed PostgreSQL 対応。
SQLAlchemy 2.0 公式推奨パターンに準拠。
"""
from __future__ import annotations

import logging
import os
from typing import Any, Generator

from dotenv import load_dotenv
from sqlalchemy import Connection, create_engine, text
from sqlalchemy.engine import Engine, Row

load_dotenv()
logger = logging.getLogger("polonix.db")

# ----------------------------------------------------------------
# 接続URL正規化
# ----------------------------------------------------------------
_RAW_URL = os.getenv("DATABASE_URL", "").strip()
if not _RAW_URL:
    raise RuntimeError("DATABASE_URL が未設定です")

# Heroku 互換: postgres:// → postgresql://
DATABASE_URL = (
    _RAW_URL.replace("postgres://", "postgresql://", 1)
    if _RAW_URL.startswith("postgres://") else _RAW_URL
)

# ----------------------------------------------------------------
# Engine 構築
# ----------------------------------------------------------------
_engine_kwargs: dict[str, Any] = {
    "pool_size":     5,
    "max_overflow":  10,
    "pool_pre_ping": True,
    "pool_recycle":  300,
    "pool_timeout":  30,
    "future":        True,
}

if DATABASE_URL.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {
        "connect_timeout": 10,
        "sslmode":         "require",
    }

engine: Engine = create_engine(DATABASE_URL, **_engine_kwargs)


# ----------------------------------------------------------------
# DI 用の get_db
# ----------------------------------------------------------------
def get_db() -> Generator[Connection, None, None]:
    """
    FastAPI Depends 用の DB セッション。
    例外時は自動ロールバック、正常終了時に commit する。
    """
    conn = engine.connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ----------------------------------------------------------------
# Row → dict 変換ヘルパー
# ----------------------------------------------------------------
def row_to_dict(row: Row | None) -> dict[str, Any] | None:
    """単一の Row を dict に変換。None の場合は None を返す。"""
    return dict(row._mapping) if row is not None else None


def rows_to_list(rows: list[Row]) -> list[dict[str, Any]]:
    """Row のリストを dict のリストに変換。"""
    return [dict(r._mapping) for r in rows]


# ----------------------------------------------------------------
# ヘルスチェック
# ----------------------------------------------------------------
def ping() -> bool:
    """DB に接続できるか確認する。例外を出さず bool を返す。"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.warning("DB ping failed: %s", e)
        return False
