# Receipt / 发票 Reconciliation System

Mobile-first + web system for capturing receipts (小票), matching them one-to-one with invoices (发票), routing through finance approval, and exporting PDF packages.

---

## Quick Start (Docker)

```bash
cd receipt-reconciliation
cp backend/.env.example backend/.env
docker-compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 |

Default login: `admin@example.com` / `admin123`

---

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # edit DATABASE_URL, REDIS_URL, S3_* as needed
uvicorn app.main:app --reload     # API on :8000

# In a second terminal — Celery worker
celery -A app.workers.tasks worker --loglevel=info
```

### Web

```bash
cd web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

### Mobile

```bash
cd mobile
npm install
npx expo start
# Press 'i' for iOS simulator, 'a' for Android emulator
# Edit mobile/app.json extra.apiUrl to point to your backend IP
```

---

## Architecture

```
receipt-reconciliation/
├── backend/              FastAPI · PostgreSQL · Celery · Redis
│   └── app/
│       ├── models.py     SQLAlchemy ORM (8 tables)
│       ├── schemas.py    Pydantic request/response models
│       ├── auth/         JWT auth, role enforcement
│       ├── routers/      documents · matches · packages · admin
│       ├── services/     ocr · matching · duplicate · pdf · storage
│       └── workers/      Celery tasks: process_document, generate_pdf
├── web/                  Next.js 14 · TypeScript · Tailwind CSS
│   └── src/app/
│       ├── login/        Auth
│       ├── dashboard/    Stats + quick actions
│       ├── upload/       Drag-and-drop upload with type selector
│       ├── documents/    Filterable document list + detail/edit
│       ├── review/       Needs-review queue with bulk confirm/reject
│       ├── matches/[id]  Side-by-side document review
│       ├── approval/     Finance approval table
│       ├── export/       Package builder + download history
│       └── archive/      Searchable 90-day archive
└── mobile/               React Native · Expo Router
    └── app/
        ├── (tabs)/       Home (capture) + Documents list
        ├── upload-preview.tsx  Review before submit
        └── document/[id] Status + confidence display
```

---

## Business Rules (key)

**Amount tolerance** — match valid if:
```
allowedDifference = max(20 RMB, invoiceAmount × 0.05)
abs(receiptAmount - invoiceAmount) ≤ allowedDifference
```

**Match scoring** (weighted 0–100):
| Field | Weight |
|---|---|
| Amount | 45% |
| Time | 20% |
| Vendor | 15% |
| Invoice number | 15% |
| Tax | 5% |

**Auto-confirm** only when score ≥ 90 AND all of:
- Required fields present
- All critical field confidence above threshold
- No duplicates
- No critical warnings

**Statuses**

Documents: `Uploaded → Processing → Extracted → [Low Confidence | Needs Review] → Matched → Confirmed → Approved → Exported → Archived`

Matches: `Suggested | Auto-Confirmed → [Manually Confirmed] → Approved → Exported`

---

## OCR Providers

Set `OCR_PROVIDER` in `.env`:

| Value | Description |
|---|---|
| `mock` | Realistic fake data — default for dev/test |
| `google` | Google Cloud Vision (set `GOOGLE_APPLICATION_CREDENTIALS`) |
| `azure` | Azure Form Recognizer (set endpoint + key) |
| `aws` | AWS Textract (set AWS credentials) |

---

## Roles

| Role | Can do |
|---|---|
| `reviewer` | Upload, edit fields, confirm/reject matches, create packages |
| `approver` | Approve/reject individual pairs (finance) |
| `admin` | Everything above + user management, settings, audit logs |

---

## Admin-configurable Settings

All configurable via `PATCH /admin/settings` or the admin UI:

- `amount_tolerance_fixed` (default: 20 RMB)
- `amount_tolerance_pct` (default: 5%)
- OCR confidence thresholds (amount/date/time/invoice_number)
- `batch_upload_threshold` (default: 20 files)
- `retention_days` (default: 90)
- `company_name` (appears in PDF header)

---

## PDF Export Format

- **Page 1**: Summary table (package name, date, creator, total pairs, total amount, per-pair table)
- **Pages 2+**: One matched pair per page — receipt left, invoice right — with metadata block and any warnings

Filename: `Expense_Package_YYYY-MM-DD_{UserName}.pdf`
