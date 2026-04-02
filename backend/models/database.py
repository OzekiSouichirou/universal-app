"""Polonix v0.9.3 - DB接続層"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_engine_kwargs = {
    "pool_size":    3,
    "max_overflow": 5,
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "pool_timeout": 30,
}

if DATABASE_URL.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {
        "connect_timeout": 30,
        # statement_timeout はNeonのpoolerが非対応のため除外
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
