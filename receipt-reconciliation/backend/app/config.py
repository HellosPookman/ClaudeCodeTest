from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql://recon:recon_secret@localhost:5432/reconciliation"
    redis_url: str = "redis://localhost:6379/0"

    # Storage
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "reconciliation"
    s3_region: str = "us-east-1"

    # Auth
    secret_key: str = "dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # OCR
    ocr_provider: str = "mock"  # mock | google | azure | aws
    google_application_credentials: str = ""
    azure_form_recognizer_endpoint: str = ""
    azure_form_recognizer_key: str = ""

    # Matching & confidence thresholds (admin-configurable)
    amount_tolerance_fixed: float = 20.0
    amount_tolerance_pct: float = 0.05
    ocr_confidence_amount: float = 0.95
    ocr_confidence_date: float = 0.90
    ocr_confidence_time: float = 0.90
    ocr_confidence_invoice_number: float = 0.95
    batch_upload_threshold: int = 20
    retention_days: int = 90

    # Export
    company_name: str = "My Company"
    company_logo_url: str = ""

    environment: str = "development"
    cors_origins: str = "http://localhost:3000,http://localhost:19006"

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
