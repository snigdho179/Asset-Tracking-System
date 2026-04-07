# Secure Asset Tracking & QR Verification System

FastAPI + MySQL application for secure asset ID ingestion, AES-256-GCM encryption, QR generation, and camera-based verification.

## 1. Setup

1. Create and activate a virtual environment.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and update MySQL credentials:

   ```bash
   cp .env.example .env
   ```

## 2. Run

```bash
uvicorn app.main:app --reload
```

Open:

- Admin ingestion dashboard: `http://127.0.0.1:8000/static/admin.html`
- Scanner interface: `http://127.0.0.1:8000/static/scanner.html`

Inside the Admin dashboard, use **ID Manager** (left sidebar) to:

- Search IDs already stored in the database
- View the latest 20 added IDs
- Update max scans for an existing ID
- Delete an existing ID

## 3. API

### POST /ingest

Request body:

```json
{
  "master_key": "your-secure-master-key",
  "records": [
    {
      "original_id": "ID-1",
      "max_scans": 3,
      "lat": 23.810332,
      "lon": 90.412518,
      "radius_meters": 150
    }
  ]
}
```

`records` must contain at least 1 row per request. For each row, `lat` and `lon` are optional but must be provided together.

### POST /verify

Request body:

```json
{
  "encrypted_blob": "<value read from scanned QR code>",
  "user_lat": 23.8103,
  "user_lon": 90.4125
}
```

### GET /api/assets

Authenticated endpoint. Returns recent assets, or search results by `original_id`.

Query params:

- `query` (optional): partial asset ID text
- `limit` (optional): number of rows (default 20, max 100)

### PUT /api/assets/{public_id}

Authenticated endpoint. Updates the maximum allowed scans for an asset.

Request body:

```json
{
  "max_scans": 5
}
```

### DELETE /api/assets/{public_id}

Authenticated endpoint. Deletes the asset record and corresponding QR image.
