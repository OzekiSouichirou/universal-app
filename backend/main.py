from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.database import Base, engine
from auth.routes import router as auth_router
from routes.users import router as users_router
from routes.logs import router as logs_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="汎用アプリ API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(logs_router, prefix="/logs", tags=["logs"])

@app.get("/")
def root():
    return {"status": "ok", "message": "API is running"}