from sqlalchemy import TIMESTAMP, Column, Integer, Numeric, String, Text, func

from .database import Base


class AssetRecord(Base):
    __tablename__ = "asset_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    public_id = Column(String(36), unique=True, index=True, nullable=False)
    original_id = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    encrypted_blob = Column(Text, nullable=False)
    secret_key = Column(Text, nullable=False)
    nonce = Column(Text, nullable=False)
    max_scans = Column(Integer, nullable=False, default=1, server_default="1")
    scan_count = Column(Integer, nullable=False, default=0, server_default="0")
    lat = Column(Numeric(10, 8), nullable=True)
    lon = Column(Numeric(11, 8), nullable=True)
    radius_meters = Column(Integer, nullable=False, default=100, server_default="100")
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp(), nullable=False)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp(), nullable=False)
    updated_at = Column(TIMESTAMP, server_default=func.current_timestamp(), onupdate=func.current_timestamp(), nullable=True)
