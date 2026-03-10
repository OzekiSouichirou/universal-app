import bcrypt
from database import Base, engine, SessionLocal, User

def init():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    existing = db.query(User).filter(User.username == "admin").first()

    if not existing:
        password = "admin1234".encode("utf-8")
        hashed = bcrypt.hashpw(password, bcrypt.gensalt())
        admin = User(
            username="admin",
            hashed_password=hashed.decode("utf-8"),
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