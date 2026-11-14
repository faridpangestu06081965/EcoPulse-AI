# EcoPulse: Waste Generation Forecasting Dashboard

![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-REST%20API-009688.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-3.4-38BDF8.svg)
![Domain](https://img.shields.io/badge/Domain-Smart%20City%20%26%20Sustainability-22C55E.svg)
![License](https://img.shields.io/badge/License-Unspecified-lightgrey.svg)

A decoupled municipal solid waste (MSW) forecasting platform. A Python **FastAPI** backend trains and serves four time-series models across every *zone x waste-type* combination, while a **React + Vite + Tailwind** frontend renders the results as a dark "Smart City Command Center" dashboard with operational recommendations.

---

## 📌 Technical Highlights

- 🧠 **Four Forecasting Engines**: ARIMA/SARIMAX, LSTM, Random Forest and XGBoost, each trained per combination — 8 zones x 6 waste streams = **48 models per algorithm**.
- 📐 **Feature Engineering**: Lag features `[1, 2, 3, 7, 14, 21, 30]`, rolling mean/std over `[7, 14, 30]` days, and calendar features (`dow`, `month`, `doy`, `is_weekend`, `day`, `week`). The LSTM consumes a **14-day lookback** sequence.
- 🧪 **Schema-Tolerant Ingestion**: The `/api/upload` endpoint auto-detects column names (date, area, type, volume, weight) from a new CSV, invalidates the previous artefacts and retrains every model in the background.
- 💨 **Uncertainty & Disturbance Modeling**: ARIMA returns native confidence intervals; tree/LSTM models use an RMSE-scaled band ($\sigma = 1.28 \times \text{RMSE}$). Unseen or failed combinations gracefully degrade to a seasonal-naive baseline.
- 🚛 **Operational Planning**: Fleet sizing from predicted tonnage,
  $$N_{\text{trucks}} = \left\lceil \frac{W_{\text{tons}}}{10\ \text{t}} \right\rceil$$
  plus a per-day schedule flagged `Normal` / `High Load` / `Critical Spike`.
- ⚖️ **Volume → Weight Conversion**: Uses a per-combination median bulk density, falling back to $\rho = 300\ \text{kg/m}^3$ when weight is unavailable.
- ⚙️ **100% Decoupled Architecture**: The API and dashboard communicate purely over REST; during development a Vite proxy forwards `/api` to the backend, so no CORS wiring is needed.

---

## 📈 Performance Characteristics

Averaged over all **48 zone x waste-type combinations** on a 30-day hold-out set (volume in m³/day):

| Model | 1-step RMSE | 1-step MAE | 30-day RMSE |
| --- | --- | --- | --- |
| ARIMA / SARIMAX | **4.50** | **3.41** | **5.16** |
| LSTM Neural Net | 4.70 | 3.57 | 5.18 |
| Random Forest | 4.81 | 3.66 | 5.50 |
| XGBoost | 5.29 | 4.10 | 5.91 |

*Municipal waste series on this dataset are highly volatile. ARIMA leads on one-step-ahead accuracy; multi-step R² is negative for every model, reflecting the intrinsic difficulty of long-horizon prediction here.*

---

## 🛠️ Usage

1. Clone the repository (Git LFS required for `.csv`, `.joblib` and `.keras` files):
   ```bash
   git lfs install
   git clone https://github.com/faridpangestu06081965/EcoPulse-AI.git
   ```
2. Start the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
   Interactive API docs are available at `http://127.0.0.1:8000/docs`.
3. Start the frontend in a second terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173`.
4. *(Optional)* Rebuild the processed frame and retrain the models:
   ```bash
   cd backend
   python preprocessing.py --input ../Smart_Solid_Waste_Management_Dataset.csv --out ./data
   python train_models.py --force
   ```

Trained artefacts already ship with the repository under `backend/saved_models/models/`, so retraining is optional on first run.

---

## 🧩 Models

| Key | Label | Type |
| --- | --- | --- |
| `random_forest` | Random Forest | Ensemble of bagged trees |
| `xgboost` | XGBoost | Gradient boosting |
| `lstm` | LSTM Neural Net | Deep recurrent network (14-day lookback) |
| `arima` | ARIMA / SARIMAX | Statistical time-series model |

---

## 📊 Dataset

Default dataset: `Smart_Solid_Waste_Management_Dataset.csv`.

| Property | Value |
| --- | --- |
| Rows | 15,000 |
| Date range | 2024-08-04 → 2025-08-03 (365 days) |
| Zones (8) | Central, East, Industrial, North, South, Suburban, Urban, West |
| Waste types (6) | Glass, Metal, Mixed, Organic, Paper, Plastic |
| Total volume | 156,525.53 m³ |
| Total weight | 10,579.96 tons |

---

## 📡 API Reference

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service status, dataset summary, trained-combination count |
| `GET` | `/api/filters` | Available zones, waste types, models and horizon bounds |
| `GET` | `/api/forecast` | History + forecast + metrics + operational plan |
| `POST` | `/api/upload` | Ingest a new CSV dataset and (optionally) retrain |

### `GET /api/forecast`

| Query param | Type | Default | Notes |
| --- | --- | --- | --- |
| `area` | string | required | Must be a known zone |
| `waste_type` | string | required | A waste type, or `All Types` |
| `model` | string | `random_forest` | One of the four model keys |
| `days` | int | `14` | 7–30 |

The response contains `meta`, `historical` (last 90 days), `forecast` (with `lower_m3` / `upper_m3`), `metrics`, `kpis`, `breakdown`, `schedule` and `recommendations`.

---

## 🗂️ Project Structure

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

---

## ⚠️ Error Handling

| Status | When |
| --- | --- |
| `400` | Unknown area, model or waste type |
| `404` | No records exist for the requested zone / waste-type combination |
| `422` | Uploaded CSV could not be parsed |

---

## 📝 Notes

- Large binaries (`.csv`, `.joblib`, `.keras`) are tracked with **Git LFS** — install it before cloning so the real files are fetched instead of pointer files.
- `.env` files, keys, `node_modules/` and build output are excluded via `.gitignore`.
- Operational assumptions: truck payload **10 tons**, history window **90 days**, density fallback **300 kg/m³**.
