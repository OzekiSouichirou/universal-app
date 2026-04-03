"""Polonix v0.9.3 - DB接続層（Neon対応）"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_engine_kwargs = {
    "pool_size":     3,
    "max_overflow":  5,
    "pool_pre_ping": True,
    "pool_recycle":  60,   # Neonのサスペンドサイクルに合わせて短縮
    "pool_timeout":  10,   # 接続取得タイムアウトを短縮
}

if DATABASE_URL.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {
        "connect_timeout": 10,  # Neonは再起動が速いので短縮
    }

engine = create_engine(DATABASE_URL, **_engine_kwargs)

def get_db():
    conn = engine.connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def row_to_dict(row) -> dict:
    if row is None:
        return None
    return dict(row._mapping)

def rows_to_list(rows) -> list:
    return [dict(r._mapping) for r in rows]
