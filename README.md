# EcoPulse — Waste Generation Forecasting Dashboard

A production-style, decoupled application for **municipal solid waste (MSW) generation forecasting**. A Python **FastAPI** backend trains and serves four forecasting models across every *zone x waste-type* combination, while a **React + Vite + Tailwind** frontend renders the results as a dark "Smart City Command Center" dashboard with operational recommendations (truck allocation, collection schedule).

---

## Features

- **Multi-model forecasting** — ARIMA/SARIMAX, LSTM, Random Forest and XGBoost, selectable per request.
- **All combinations covered** — 8 zones x 6 waste streams = **48 trained models per algorithm**.
- **Configurable horizon** — forecast between **7 and 30 days** (default 14).
- **Explainable metrics** — RMSE / MAE / R2 and an accuracy score per selection.
- **Operational planning** — estimated trucks required (10 t payload per vehicle), per-day schedule with load status (Normal / High Load / Critical Spike), and a recommended collection frequency.
- **Schema-tolerant upload** — upload a different CSV; column names are auto-detected, old artefacts are invalidated and models are retrained in the background.
- **Graceful degradation** — if a trained artefact is missing or fails, the API falls back to a seasonal-naive forecast instead of erroring out.
- **Predictions hidden until run** — the dashboard shows no results until the user explicitly runs a forecast.

## Architecture

```
Waste/
├── backend/                 # FastAPI service (Python)
│   ├── main.py              # REST API + response assembly
│   ├── preprocessing.py     # schema-tolerant cleaning & feature engineering
│   ├── train_models.py      # training + recursive forecasting helpers
│   ├── data/                # active dataset, processed frame, metadata
│   └── saved_models/models/ # per-combination artefacts (Git LFS)
└── frontend/                # React + Vite dashboard (TypeScript)
    └── src/
        ├── components/      # charts, KPI cards, controls, modals
        ├── hooks/           # count-up animation
        └── api/client.ts    # axios client
```

The frontend talks to the backend through a Vite dev proxy (`/api` -> `http://127.0.0.1:8000`), so no CORS configuration is needed during development.

## Tech Stack

**Backend**

| Layer | Technology |
| --- | --- |
| API | FastAPI, Uvicorn |
| Data | pandas, NumPy |
| Models | scikit-learn (Random Forest), XGBoost, statsmodels (ARIMA/SARIMAX), TensorFlow/Keras (LSTM) |
| Persistence | joblib (`.joblib`), Keras (`.keras`) |

**Frontend**

| Layer | Technology |
| --- | --- |
| Framework | React 19, TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 3.4 (glassmorphism dark theme) |
| Charts | Recharts |
| Icons / HTTP | lucide-react, axios |

## Dataset

The default dataset is `Smart_Solid_Waste_Management_Dataset.csv`.

| Property | Value |
| --- | --- |
| Rows | 15,000 |
| Date range | 2024-08-04 → 2025-08-03 (365 days) |
| Zones (8) | Central, East, Industrial, North, South, Suburban, Urban, West |
| Waste types (6) | Glass, Metal, Mixed, Organic, Paper, Plastic |
| Total volume | 156,525.53 m3 |
| Total weight | 10,579.96 tons |

The active dataset is copied to `backend/data/active_dataset.csv`; the cleaned/aggregated frame is written to `backend/data/processed_daily.csv` and its summary to `backend/data/metadata.json`.

## Models

| Key | Label | Type |
| --- | --- | --- |
| `random_forest` | Random Forest | Ensemble of bagged trees |
| `xgboost` | XGBoost | Gradient boosting |
| `lstm` | LSTM Neural Net | Deep recurrent network (14-day lookback) |
| `arima` | ARIMA / SARIMAX | Statistical time-series model |

**Feature engineering** (`preprocessing.py`): lag features `[1, 2, 3, 7, 14, 21, 30]`, rolling mean/std over `[7, 14, 30]` days, and calendar features (`dow`, `month`, `doy`, `is_weekend`, `day`, `week`).

**Forecasting**: tree and LSTM models are applied recursively over their context window; ARIMA returns native confidence intervals, while the other models use an RMSE-based uncertainty band. Volume is converted to weight using a per-combination median density (fallback: `300 kg/m3`).

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Git LFS (the repository stores `.csv`, `.joblib` and `.keras` files via Git LFS)

```bash
git lfs install
git clone https://github.com/faridpangestu06081965/EcoPulse-AI.git
```

### Backend

```bash
cd backend
pip install -r requirements.txt

# (optional) rebuild the processed frame and retrain models
python preprocessing.py --input ../Smart_Solid_Waste_Management_Dataset.csv --out ./data
python train_models.py --force

# run the API
uvicorn main:app --reload --port 8000
```

Interactive API docs: `http://127.0.0.1:8000/docs`.

Trained artefacts already ship with the repository under `backend/saved_models/models/`, so training is optional on first run.

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build), `npm run preview`, `npm run lint`.

## API Reference

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service status, dataset summary, number of trained combinations |
| `GET` | `/api/filters` | Available zones, waste types, models and horizon bounds |
| `GET` | `/api/forecast` | History + forecast + metrics + operational plan |
| `POST` | `/api/upload` | Ingest a new CSV dataset and (optionally) retrain |

### `GET /api/forecast`

| Query param | Type | Default | Notes |
| --- | --- | --- | --- |
| `area` | string | required | Must be one of the known zones |
| `waste_type` | string | required | A waste type, or `All Types` |
| `model` | string | `random_forest` | One of the four model keys |
| `days` | int | `14` | 7–30 |

Response contains `meta`, `historical` (last 90 days), `forecast` (with `lower_m3`/`upper_m3`), `metrics`, `kpis`, `breakdown`, `schedule` and `recommendations`.

### `POST /api/upload`

Multipart form-data with a `file` field (`.csv`). Query param `retrain` (default `true`) controls whether models are retrained in the background. A successful upload replaces the active dataset, deletes the previous model artefacts, and starts retraining.

## Error Handling

| Status | When |
| --- | --- |
| `400` | Unknown area, model or waste type |
| `404` | No records exist for the requested zone / waste-type combination |
| `422` | Uploaded CSV could not be parsed |

## Operational Assumptions

- Collection truck payload: **10 tons** per vehicle.
- History window returned to the dashboard: **90 days**.
- Density fallback when weight is unavailable: **300 kg/m3**.
- Collection frequency recommendation: `>= 8 t/day` daily, `>= 4 t/day` every 2 days, `>= 2 t/day` 3x/week, otherwise 2x/week.

## Notes

- Large binaries (`.csv`, `.joblib`, `.keras`) are tracked with **Git LFS**. Install Git LFS before cloning so the real files are fetched instead of pointer files.
- `.env` files, keys, `node_modules/` and build output are excluded via `.gitignore`.

## License

No license has been specified for this project.
