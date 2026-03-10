import bcrypt
from database import Base, engine, SessionLocal, User

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def init():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    existing = db.query(User).filter(User.username == "admin").first()

    if not existing:
        admin = User(
            username="admin",
            hashed_password=hash_password("admin1234"),
            role="admin"
        )
        db.add(admin)
        db.commit()
        print("管理者アカウントを作成しました")
    else:
        print("管理者アカウントは既に存在します")

    db.close()

if __name__ == "__main__":
    init()