"""
Polonix v0.9.0 - DB接続層
生SQL専用。ORM定義なし。
接続プールの最適化・フォールバック設定追加。
"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 接続プール設定（Render無料枠に最適化）
_engine_kwargs = {
    "pool_size": 3,           # 同時接続数（無料枠は上限10）
    "max_overflow": 5,        # 追加接続
    "pool_pre_ping": True,    # 接続死活確認
    "pool_recycle": 300,      # 5分で接続を再作成（タイムアウト防止）
    "pool_timeout": 30,       # 接続取得タイムアウト
}

if DATABASE_URL.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {
        "connect_timeout": 30,
        "options": "-c statement_timeout=30000",  # クエリ30秒タイムアウト
    }

engine = create_engine(DATABASE_URL, **_engine_kwargs)

def get_db():
    """FastAPI Depends用DBコネクション取得"""
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
