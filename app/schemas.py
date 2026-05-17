from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class IngestRecord(BaseModel):
    original_id: str = Field(..., description="Asset identifier to encrypt")
    max_scans: int = Field(1, ge=1, description="Maximum allowed successful scans")
    lat: float | None = Field(None, ge=-90, le=90, description="Authorized latitude")
    lon: float | None = Field(None, ge=-180, le=180, description="Authorized longitude")
    radius_meters: int = Field(100, ge=1, description="Allowed geofence radius in meters")

    @field_validator("original_id")
    @classmethod
    def validate_original_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("original_id must be a non-empty string.")
        return cleaned

    @model_validator(mode="after")
    def validate_geofence_pair(self) -> "IngestRecord":
        has_lat = self.lat is not None
        has_lon = self.lon is not None
        if has_lat != has_lon:
            raise ValueError("lat and lon must be provided together or omitted together.")
        return self


class IngestRequest(BaseModel):
    master_key: str = Field(..., description="Master encryption key provided by admin")
    ids: list[str] | None = Field(None, description="Legacy list of asset IDs")
    records: list[IngestRecord] | None = Field(
        None,
        description="List of asset records with scan and geofence settings",
    )

    @field_validator("master_key")
    @classmethod
    def validate_master_key(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 8:
            raise ValueError("master_key must be at least 8 characters.")
        return cleaned

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return value

        cleaned: list[str] = []

        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise ValueError("Every ID must be a non-empty string.")
            cleaned.append(item.strip())

        return cleaned

    @field_validator("records")
    @classmethod
    def validate_records(cls, value: list[IngestRecord] | None) -> list[IngestRecord] | None:
        return value

    @model_validator(mode="after")
    def validate_source_and_batch_size(self) -> "IngestRequest":
        has_ids = bool(self.ids)
        has_records = bool(self.records)

        if has_ids and has_records:
            raise ValueError("Provide either ids or records, not both.")

        if not has_ids and not has_records:
            raise ValueError("Provide either ids or records for ingestion.")

        return self


class IngestedItem(BaseModel):
    public_id: str
    original_id: str
    qr_path: str


class IngestResponse(BaseModel):
    items: list[IngestedItem]


class AssetManagerItem(BaseModel):
    public_id: str
    original_id: str
    qr_path: str
    created_at: datetime
    max_scans: int
    scan_count: int


class AssetManagerListResponse(BaseModel):
    items: list[AssetManagerItem]


class AssetUpdateRequest(BaseModel):
    max_scans: int = Field(..., ge=1, description="Updated maximum allowed successful scans")


class AssetUpdateResponse(BaseModel):
    message: str
    public_id: str
    max_scans: int
    scan_count: int


class AssetDeleteResponse(BaseModel):
    message: str
    public_id: str


class VerifyRequest(BaseModel):
    encrypted_blob: str
    user_lat: float = Field(..., ge=-90, le=90)
    user_lon: float = Field(..., ge=-180, le=180)

    @field_validator("encrypted_blob")
    @classmethod
    def validate_blob(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("encrypted_blob must not be empty.")
        return cleaned


class VerifyResponse(BaseModel):
    verified: bool = True
    public_id: str
    original_id: str
    scan_count: int
    max_scans: int


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Admin username")
    password: str = Field(..., min_length=1, description="Admin password")


class LoginResponse(BaseModel):
    token: str
    username: str


class ChangeCredentialsRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Current password for verification")
    new_username: str | None = Field(None, min_length=3, max_length=100, description="New username (optional)")
    new_password: str | None = Field(None, min_length=6, description="New password (optional)")

    @model_validator(mode="after")
    def validate_at_least_one_change(self) -> "ChangeCredentialsRequest":
        if not self.new_username and not self.new_password:
            raise ValueError("Provide at least a new username or new password.")
        return self


class ChangeCredentialsResponse(BaseModel):
    message: str
    username: str


class AdminInfoResponse(BaseModel):
    username: str
