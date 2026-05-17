import os
from collections.abc import Generator

from dotenv import load_dotenv
from passlib.context import CryptContext
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing. Add it to your .env file.")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin"


def ensure_asset_records_schema() -> None:
    inspector = inspect(engine)
    if "asset_records" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("asset_records")}
    required_columns = {
        "max_scans": "max_scans INT NOT NULL DEFAULT 1",
        "scan_count": "scan_count INT NOT NULL DEFAULT 0",
        "lat": "lat DECIMAL(10, 8) NULL",
        "lon": "lon DECIMAL(11, 8) NULL",
        "radius_meters": "radius_meters INT NOT NULL DEFAULT 100",
        "description": "description TEXT NULL",
    }

    with engine.begin() as connection:
        for column_name, sql_fragment in required_columns.items():
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE asset_records ADD COLUMN {sql_fragment}"))


def seed_default_admin() -> None:
    from .models import AdminUser

    db = SessionLocal()
    try:
        existing = db.execute(select(AdminUser).limit(1)).scalar_one_or_none()
        if existing is None:
            admin = AdminUser(
                username=DEFAULT_ADMIN_USERNAME,
                password_hash=pwd_context.hash(DEFAULT_ADMIN_PASSWORD),
            )
            db.add(admin)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def initialize_database() -> None:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        Base.metadata.create_all(bind=engine)
        ensure_asset_records_schema()
        seed_default_admin()
    except SQLAlchemyError as exc:
        raise RuntimeError("Could not connect to MySQL. Verify DATABASE_URL and DB server.") from exc


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
