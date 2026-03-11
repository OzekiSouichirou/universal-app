import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.database import Base, engine
from auth.routes import router as auth_router
from routes.users import router as users_router
from routes.logs import router as logs_router
from routes.notices import router as notices_router
from dotenv import load_dotenv

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Polonix API", version="0.1.0-beta")

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(logs_router, prefix="/logs", tags=["logs"])
app.include_router(notices_router, prefix="/notices", tags=["notices"])

@app.get("/")
def root():
    return {"status": "ok", "message": "Polonix API is running"}