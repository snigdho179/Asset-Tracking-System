import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from sqlalchemy import select, delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import get_db, initialize_database, pwd_context
from .models import AdminUser, AssetRecord
from .qr_utils import save_qr_image
from .schemas import (
    AssetDeleteResponse,
    AssetManagerItem,
    AssetManagerListResponse,
    AssetUpdateRequest,
    AssetUpdateResponse,
    AdminInfoResponse,
    ChangeCredentialsRequest,
    ChangeCredentialsResponse,
    IngestRecord,
    IngestRequest,
    IngestResponse,
    IngestedItem,
    LoginRequest,
    LoginResponse,
    VerifyRequest,
    VerifyResponse,
)
from .security import DecryptionError, decrypt_identifier, encrypt_identifier

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
QR_DIR = STATIC_DIR / "qrs"
QR_DIR.mkdir(parents=True, exist_ok=True)
EARTH_RADIUS_METERS = 6_371_000

JWT_SECRET = os.getenv("JWT_SECRET", "ats-default-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

app = FastAPI(
    title="Secure Asset Tracking & QR Verification System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)) -> AdminUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")

    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid.")

    user = db.execute(select(AdminUser).where(AdminUser.username == username)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    return user


def _haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c


@app.on_event("startup")
def startup() -> None:
    initialize_database()


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/static/admin.html")


# ─── Auth endpoints ───────────────────────────────────────────────────

@app.post("/api/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.execute(
        select(AdminUser).where(AdminUser.username == payload.username)
    ).scalar_one_or_none()

    if not user or not pwd_context.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = _create_token(user.username)
    return LoginResponse(token=token, username=user.username)


@app.get("/api/me", response_model=AdminInfoResponse)
def get_me(user: AdminUser = Depends(_get_current_user)) -> AdminInfoResponse:
    return AdminInfoResponse(username=user.username)


@app.post("/api/change-credentials", response_model=ChangeCredentialsResponse)
def change_credentials(
    payload: ChangeCredentialsRequest,
    user: AdminUser = Depends(_get_current_user),
    db: Session = Depends(get_db),
) -> ChangeCredentialsResponse:
    if not pwd_context.verify(payload.current_password, user.password_hash):
        raise HTTPException(status_code=403, detail="Current password is incorrect.")

    if payload.new_username and payload.new_username != user.username:
        existing = db.execute(
            select(AdminUser).where(AdminUser.username == payload.new_username)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken.")
        user.username = payload.new_username

    if payload.new_password:
        user.password_hash = pwd_context.hash(payload.new_password)

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update credentials.") from exc

    return ChangeCredentialsResponse(
        message="Credentials updated successfully.",
        username=user.username,
    )


# ─── Asset endpoints ──────────────────────────────────────────────────

@app.post("/ingest", response_model=IngestResponse)
def ingest_assets(payload: IngestRequest, db: Session = Depends(get_db)) -> IngestResponse:
    results: list[IngestedItem] = []
    records: list[IngestRecord] = payload.records or [
        IngestRecord(original_id=original_id) for original_id in (payload.ids or [])
    ]

    incoming_ids = [item.original_id for item in records]
    duplicate_ids_in_payload: set[str] = set()
    seen_ids: set[str] = set()
    for original_id in incoming_ids:
        if original_id in seen_ids:
            duplicate_ids_in_payload.add(original_id)
        else:
            seen_ids.add(original_id)

    if duplicate_ids_in_payload:
        duplicate_list = sorted(duplicate_ids_in_payload)
        if len(duplicate_list) == 1:
            raise HTTPException(status_code=409, detail=f"ID already exists in the request: {duplicate_list[0]}.")
        raise HTTPException(
            status_code=409,
            detail="Duplicate IDs found in the request: " + ", ".join(duplicate_list) + ".",
        )

    try:
        existing_ids = db.execute(
            select(AssetRecord.original_id).where(AssetRecord.original_id.in_(incoming_ids))
        ).scalars().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error while checking existing IDs.") from exc

    if existing_ids:
        unique_existing_ids = sorted(set(existing_ids))
        if len(unique_existing_ids) == 1:
            raise HTTPException(
                status_code=409,
                detail=f"ID already exists in the database: {unique_existing_ids[0]}.",
            )
        raise HTTPException(
            status_code=409,
            detail="IDs already exist in the database: " + ", ".join(unique_existing_ids) + ".",
        )

    try:
        for item in records:
            encrypted_blob, secret_key, nonce = encrypt_identifier(
                original_id=item.original_id,
                master_key=payload.master_key,
            )
            public_id = str(uuid.uuid4())
            qr_filename = f"{public_id}.png"
            qr_path = QR_DIR / qr_filename

            save_qr_image(encrypted_blob, qr_path)

            record = AssetRecord(
                public_id=public_id,
                original_id=item.original_id,
                encrypted_blob=encrypted_blob,
                secret_key=secret_key,
                nonce=nonce,
                max_scans=item.max_scans,
                scan_count=0,
                lat=item.lat,
                lon=item.lon,
                radius_meters=item.radius_meters,
            )
            db.add(record)

            results.append(
                IngestedItem(
                    public_id=public_id,
                    original_id=item.original_id,
                    qr_path=f"/static/qrs/{qr_filename}",
                )
            )

        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while ingesting records.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unexpected ingestion error.") from exc

    return IngestResponse(items=results)


@app.get("/api/assets", response_model=AssetManagerListResponse)
def list_assets(
    query: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=20, ge=1, le=100),
    _: AdminUser = Depends(_get_current_user),
    db: Session = Depends(get_db),
) -> AssetManagerListResponse:
    cleaned_query = (query or "").strip()

    stmt = select(AssetRecord)
    if cleaned_query:
        stmt = stmt.where(AssetRecord.original_id.ilike(f"%{cleaned_query}%"))

    stmt = stmt.order_by(AssetRecord.created_at.desc(), AssetRecord.id.desc()).limit(limit)

    try:
        records = db.execute(stmt).scalars().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading assets.") from exc

    return AssetManagerListResponse(
        items=[
            AssetManagerItem(
                public_id=record.public_id,
                original_id=record.original_id,
                qr_path=f"/static/qrs/{record.public_id}.png",
                created_at=record.created_at,
                max_scans=record.max_scans,
                scan_count=record.scan_count,
            )
            for record in records
        ]
    )


@app.put("/api/assets/{public_id}", response_model=AssetUpdateResponse)
def update_asset(
    public_id: str,
    payload: AssetUpdateRequest,
    _: AdminUser = Depends(_get_current_user),
    db: Session = Depends(get_db),
) -> AssetUpdateResponse:
    try:
        record = db.execute(
            select(AssetRecord)
            .where(AssetRecord.public_id == public_id)
            .with_for_update()
        ).scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading asset.") from exc

    if record is None:
        raise HTTPException(status_code=404, detail="Asset not found.")

    record.max_scans = payload.max_scans

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while updating asset.") from exc

    return AssetUpdateResponse(
        message="Maximum scans updated successfully.",
        public_id=record.public_id,
        max_scans=record.max_scans,
        scan_count=record.scan_count,
    )


@app.delete("/api/assets/{public_id}", response_model=AssetDeleteResponse)
def delete_asset(
    public_id: str,
    _: AdminUser = Depends(_get_current_user),
    db: Session = Depends(get_db),
) -> AssetDeleteResponse:
    try:
        record = db.execute(
            select(AssetRecord).where(AssetRecord.public_id == public_id)
        ).scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database error while loading asset.") from exc

    if record is None:
        raise HTTPException(status_code=404, detail="Asset not found.")

    db.delete(record)

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while deleting asset.") from exc

    qr_path = QR_DIR / f"{public_id}.png"
    try:
        qr_path.unlink(missing_ok=True)
    except OSError:
        pass

    return AssetDeleteResponse(
        message="Asset deleted successfully.",
        public_id=public_id,
    )


@app.delete("/api/assets", response_model=AssetDeleteResponse)
def delete_all_assets(
    _: AdminUser = Depends(_get_current_user),
    db: Session = Depends(get_db),
) -> AssetDeleteResponse:
    try:
        db.execute(delete(AssetRecord))
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while deleting all assets.") from exc

    for qr_file in QR_DIR.glob("*.png"):
        try:
            qr_file.unlink(missing_ok=True)
        except OSError:
            pass

    return AssetDeleteResponse(
        message="All assets deleted successfully.",
        public_id="all",
    )


@app.post("/verify", response_model=VerifyResponse)
def verify_asset(payload: VerifyRequest, db: Session = Depends(get_db)) -> VerifyResponse:
    try:
        record = db.execute(
            select(AssetRecord)
            .where(AssetRecord.encrypted_blob == payload.encrypted_blob)
            .with_for_update()
        ).scalar_one_or_none()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail="Database connection error during verification.") from exc

    if record is None:
        raise HTTPException(status_code=404, detail="Security Warning: QR token was not found.")

    try:
        decrypted_id = decrypt_identifier(
            encrypted_blob_b64=record.encrypted_blob,
            key_b64=record.secret_key,
            nonce_b64=record.nonce,
        )
    except DecryptionError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Security Warning: QR token appears tampered.") from exc

    scan_count = record.scan_count or 0
    max_scans = record.max_scans or 1

    if scan_count >= max_scans:
        db.rollback()
        raise HTTPException(status_code=403, detail="Invalid QR.")

    if record.lat is not None and record.lon is not None:
        distance_meters = _haversine_distance_meters(
            lat1=float(record.lat),
            lon1=float(record.lon),
            lat2=payload.user_lat,
            lon2=payload.user_lon,
        )
        radius_meters = record.radius_meters or 100

        if distance_meters > radius_meters:
            db.rollback()
            raise HTTPException(
                status_code=403,
                detail="Outside the area.",
            )

    try:
        record.scan_count = scan_count + 1
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while updating scan count.") from exc

    return VerifyResponse(public_id=record.public_id, original_id=decrypted_id)
