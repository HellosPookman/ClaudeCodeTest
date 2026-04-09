from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .database import create_tables, SessionLocal
from .auth.router import router as auth_router
from .auth.utils import seed_admin
from .routers.documents import router as documents_router
from .routers.matches import router as matches_router
from .routers.packages import router as packages_router
from .routers.admin import router as admin_router

settings = get_settings()

app = FastAPI(
    title="Receipt Reconciliation API",
    description="OCR-powered receipt/invoice matching and finance approval system",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(matches_router)
app.include_router(packages_router)
app.include_router(admin_router)


@app.on_event("startup")
def on_startup():
    create_tables()
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"name": "Receipt Reconciliation API", "version": "1.0.0", "docs": "/docs"}
