"""
EcoPulse - REST API (FastAPI)
=============================
Serves the trained forecasting models to the React dashboard.

Endpoints
---------
GET  /api/health     -> service + dataset + model readiness
GET  /api/filters    -> available Areas, Waste Types and Models
GET  /api/forecast   -> history + forecast + metrics + operational plan
POST /api/upload     -> ingest a new CSV dataset and re-run the pipeline

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import json
import math
import shutil
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import preprocessing as pp
import train_models as tm

# ---------------------------------------------------------------------------
# App & CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="EcoPulse API",
    description="Waste Generation Forecasting Dashboard - prediction service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALL_TYPES_LABEL = "All Types"
TRUCK_CAPACITY_TONS = 10.0          # assumed payload per collection truck
HISTORY_WINDOW = 90                 # days of history returned to the chart
MIN_DAYS, MAX_DAYS = 7, 30

# ---------------------------------------------------------------------------
# In-memory state (dataset + model caches)
# ---------------------------------------------------------------------------
_STATE: Dict[str, object] = {
    "processed": None,
    "metadata": None,
    "model_cache": {},
    "training": False,
    "last_upload": None,
}
_LOCK = threading.Lock()


def get_processed() -> pd.DataFrame:
    if _STATE["processed"] is None:
        load_dataset()
    return _STATE["processed"]  # type: ignore[return-value]


def load_dataset() -> None:
    """Load (or rebuild) the processed dataset + metadata."""
    with _LOCK:
        if not pp.PROCESSED_PATH.exists():
            pp.run_pipeline()
        _STATE["processed"] = pp.load_processed()
        if pp.METADATA_PATH.exists():
            _STATE["metadata"] = json.loads(pp.METADATA_PATH.read_text(encoding="utf-8"))
        else:
            meta = pp.build_metadata(_STATE["processed"], pp.resolve_dataset_path().name)
            _STATE["metadata"] = meta.to_dict()
        _STATE["model_cache"] = {}


@app.on_event("startup")
def _startup() -> None:
    load_dataset()


# ---------------------------------------------------------------------------
# Model artefact loading
# ---------------------------------------------------------------------------
def _artifact_dir(area: str, waste_type: str) -> Path:
    return tm.combo_artifact_dir(area, waste_type)


def _cache_key(area: str, waste_type: str, model: str) -> str:
    return f"{tm.slugify(area, waste_type)}::{model}"


def load_model_bundle(area: str, waste_type: str, model: str) -> Optional[Dict]:
    """
    Load the artefacts required to forecast a single (area, waste_type, model).
    Returns ``None`` when the combination has not been trained yet.
    """
    key = _cache_key(area, waste_type, model)
    if key in _STATE["model_cache"]:  # type: ignore[operator]
        return _STATE["model_cache"][key]  # type: ignore[index]

    out_dir = _artifact_dir(area, waste_type)
    models_file = out_dir / "models.joblib"
    if not models_file.exists():
        return None

    try:
        base = joblib.load(models_file)
        bundle: Dict[str, object] = {
            "context_values": base["context_values"],
            "context_dates": pd.DatetimeIndex(base["context_dates"]),
            "density": float(base["density"]),
            "lookback": int(base.get("lookback", tm.LOOKBACK)),
            "last_date": pd.Timestamp(base["last_date"]),
        }

        if model in ("random_forest", "xgboost"):
            bundle["model"] = base.get(model)
            if bundle["model"] is None:
                return None
        elif model == "lstm":
            from tensorflow.keras.models import load_model  # lazy TF import

            keras_path = out_dir / "lstm.keras"
            scaler_path = out_dir / "lstm_scaler.joblib"
            if not keras_path.exists() or not scaler_path.exists():
                return None
            bundle["model"] = load_model(keras_path, compile=False)
            bundle["scaler"] = joblib.load(scaler_path)
        elif model == "arima":
            arima_path = out_dir / "arima.joblib"
            if not arima_path.exists():
                return None
            bundle["model"] = joblib.load(arima_path)
        else:
            return None
    except Exception as exc:  # noqa: BLE001
        print(f"[model-load] {area}/{waste_type}/{model} failed: {exc}")
        return None

    _STATE["model_cache"][key] = bundle  # type: ignore[index]
    return bundle


# ---------------------------------------------------------------------------
# Forecasting
# ---------------------------------------------------------------------------
def _naive_forecast(values: np.ndarray, dates, steps: int):
    """Seasonal-naive fallback used when a trained model is unavailable."""
    season = min(7, len(values))
    last_season = values[-season:]
    preds = [float(last_season[i % season]) for i in range(steps)]
    last = pd.DatetimeIndex(dates)[-1]
    out_dates = [last + pd.Timedelta(days=i + 1) for i in range(steps)]
    return np.asarray(preds), out_dates


def _forecast_combo(area: str, waste_type: str, model: str, days: int) -> Dict:
    """Produce a forecast for one (area, waste_type) combination."""
    processed = get_processed()
    series = pp.aggregate_daily(processed, area, waste_type)
    values = series[pp.VOLUME_COL].to_numpy(dtype=float)
    weights = series[pp.WEIGHT_COL].to_numpy(dtype=float)
    dates = pd.DatetimeIndex(series.index)

    with np.errstate(divide="ignore", invalid="ignore"):
        dens = np.where(values > 0, weights / values, np.nan)
    density = float(np.nanmedian(dens)) if np.isfinite(np.nanmedian(dens)) else pp.FALLBACK_DENSITY

    bundle = load_model_bundle(area, waste_type, model)
    steps = tm.TEST_HORIZON + days
    lower = upper = None
    used_model = model
    model_ready = bundle is not None

    if bundle is not None:
        try:
            if model in ("random_forest", "xgboost"):
                preds, out_dates = tm.forecast_tree(
                    bundle["model"], bundle["context_values"],
                    bundle["context_dates"], steps)
                preds, out_dates = preds[-days:], out_dates[-days:]
            elif model == "lstm":
                preds, out_dates = tm.forecast_lstm(
                    bundle["model"], bundle["scaler"], bundle["context_values"],
                    bundle["context_dates"], steps)
                preds, out_dates = preds[-days:], out_dates[-days:]
            elif model == "arima":
                mean, lo, hi, dts = tm.forecast_arima(
                    bundle["model"], bundle["context_dates"], steps)
                preds, lower, upper, out_dates = mean[-days:], lo[-days:], hi[-days:], dts[-days:]
            else:
                raise ValueError(f"Unknown model {model}")
            density = bundle.get("density", density)
        except Exception as exc:  # noqa: BLE001 - graceful degradation
            print(f"[forecast] {area}/{waste_type}/{model} failed: {exc}")
            model_ready = False

    if not model_ready:
        preds, out_dates = _naive_forecast(values, dates, days)
        used_model = "seasonal_naive"
        density = density or pp.FALLBACK_DENSITY

    preds = np.clip(np.asarray(preds, dtype=float), 0, None)

    # heuristic uncertainty band for non-ARIMA models
    metrics = _lookup_metrics(area, waste_type, model) or {}
    rmse = metrics.get("rmse") if isinstance(metrics.get("rmse"), (int, float)) else None
    if lower is None or upper is None:
        sigma = (rmse if rmse else float(np.std(values[-30:])) or 1.0) * 1.28
        lower = np.clip(preds - sigma, 0, None)
        upper = preds + sigma

    return {
        "area": area,
        "waste_type": waste_type,
        "model": used_model,
        "model_ready": model_ready,
        "density": float(density),
        "current_values": values,
        "current_dates": dates,
        "preds": preds,
        "lower": np.asarray(lower, dtype=float),
        "upper": np.asarray(upper, dtype=float),
        "out_dates": pd.DatetimeIndex(out_dates),
        "metrics": metrics,
    }


def _lookup_metrics(area: str, waste_type: str, model: str) -> Optional[Dict]:
    metrics_file = _artifact_dir(area, waste_type) / "metrics.json"
    if not metrics_file.exists():
        return None
    try:
        record = json.loads(metrics_file.read_text(encoding="utf-8"))
        m = record.get("metrics", {}).get(model)
        if isinstance(m, dict) and "error" not in m:
            return m
    except Exception:  # noqa: BLE001
        return None
    return None


def _waste_types() -> List[str]:
    meta = _STATE["metadata"] or {}
    return list(meta.get("waste_types", []))


# ---------------------------------------------------------------------------
# Response assembly
# ---------------------------------------------------------------------------
def _build_historical(area: str, waste_types: List[str], window: int = HISTORY_WINDOW) -> List[Dict]:
    processed = get_processed()
    subset = processed[(processed[pp.AREA_COL] == area) & (processed[pp.TYPE_COL].isin(waste_types))]
    daily = subset.groupby(pp.DATE_COL).agg(
        volume=(pp.VOLUME_COL, "sum"),
        weight=(pp.WEIGHT_COL, "sum"),
    ).sort_index().tail(window)
    return [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "volume": round(float(row.volume), 3),
            "tons": round(float(row.weight) / 1000.0, 3),
        }
        for idx, row in daily.iterrows()
    ]


def _build_breakdown(area: str, window: int = 90) -> List[Dict]:
    processed = get_processed()
    subset = processed[processed[pp.AREA_COL] == area]
    if subset.empty:
        return []
    end = subset[pp.DATE_COL].max()
    recent = subset[subset[pp.DATE_COL] > end - pd.Timedelta(days=window)]
    grouped = (
        recent.groupby(pp.TYPE_COL)[pp.VOLUME_COL].sum().sort_values(ascending=False)
    )
    total = float(grouped.sum()) or 1.0
    return [
        {
            "waste_type": str(k),
            "volume": round(float(v), 2),
            "tons": round(float(v) * 0.0, 3),  # filled below where density known
            "share": round(float(v) / total * 100.0, 2),
        }
        for k, v in grouped.items()
    ]


def _status_for_ratio(ratio: float) -> str:
    if ratio > 1.5:
        return "Critical Spike"
    if ratio > 1.15:
        return "High Load"
    return "Normal"


def _schedule_for_ratio(ratio: float) -> str:
    if ratio > 1.5:
        return "Extra truck • same-day pickup"
    if ratio > 1.15:
        return "Priority route • full crew"
    return "Standard route"


def _frequency_recommendation(avg_daily_tons: float) -> str:
    if avg_daily_tons >= 8:
        return "Daily collection (7x / week)"
    if avg_daily_tons >= 4:
        return "Every 2 days (3-4x / week)"
    if avg_daily_tons >= 2:
        return "3x / week"
    return "2x / week"


def _assemble(area: str, waste_type: str, model: str, days: int) -> Dict:
    types = _waste_types() if waste_type == ALL_TYPES_LABEL else [waste_type]
    if waste_type != ALL_TYPES_LABEL and waste_type not in _waste_types():
        raise HTTPException(status_code=400, detail=f"Unknown waste type: {waste_type}")

    # Not every area x waste-type pair exists in a dataset, so skip the ones
    # without observations instead of failing the whole request.
    combos = []
    for t in types:
        try:
            combos.append(_forecast_combo(area, t, model, days))
        except ValueError:
            continue
    if not combos:
        raise HTTPException(
            status_code=404,
            detail=f"No data available for {area} / {waste_type}.",
        )

    # ---- aggregate forecast across waste types (for "All Types") ---------
    total_preds = np.sum([c["preds"] for c in combos], axis=0)
    total_lower = np.sum([c["lower"] for c in combos], axis=0)
    total_upper = np.sum([c["upper"] for c in combos], axis=0)
    out_dates = combos[0]["out_dates"]

    hist_mean = float(np.mean(np.sum([c["current_values"][-60:] for c in combos], axis=0)))
    hist_std = float(np.std(np.sum([c["current_values"][-60:] for c in combos], axis=0)))

    # a single effective density for volume -> weight conversion
    total_vol_hist = sum(float(np.sum(c["current_values"][-60:])) for c in combos)
    total_wt_hist = sum(float(np.sum(c["current_values"][-60:])) * c["density"] for c in combos)
    density = (total_wt_hist / total_vol_hist) if total_vol_hist > 0 else pp.FALLBACK_DENSITY

    # ---- metrics ---------------------------------------------------------
    valid = [c["metrics"] for c in combos if c["metrics"]]
    if valid:
        rmse = float(np.mean([m["rmse"] for m in valid if "rmse" in m]))
        mae = float(np.mean([m["mae"] for m in valid if "mae" in m]))
        r2_vals = [m["r2"] for m in valid if m.get("r2") is not None]
        r2 = float(np.mean(r2_vals)) if r2_vals else None
        accuracy = float(max(0.0, min(100.0, 100.0 * (1.0 - rmse / hist_mean))))
        metrics_out = {
            "rmse": round(rmse, 3),
            "mae": round(mae, 3),
            "r2": round(r2, 3) if r2 is not None else None,
            "accuracy_score": round(accuracy, 1),
        }
    else:
        metrics_out = {"rmse": None, "mae": None, "r2": None, "accuracy_score": None}

    model_ready = all(c["model_ready"] for c in combos)

    # ---- forecast payload ------------------------------------------------
    forecast_payload = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "volume": round(float(v), 3),
            "tons": round(float(v) * density / 1000.0, 3),
            "lower_m3": round(float(lo), 3),
            "upper_m3": round(float(hi), 3),
        }
        for d, v, lo, hi in zip(out_dates, total_preds, total_lower, total_upper)
    ]

    predicted_total_volume = float(np.sum(total_preds))
    predicted_total_tons = predicted_total_volume * density / 1000.0

    # previous-period comparison: sum the trailing `days` of actual history
    # across every waste type (each combo is sliced to the same length so the
    # arrays are broadcast-compatible even when series lengths differ).
    hist_tons_series = np.sum(
        [c["current_values"][-days:] * c["density"] for c in combos], axis=0
    ) / 1000.0
    prev_period_tons = float(np.sum(hist_tons_series))
    trend_pct = ((predicted_total_tons - prev_period_tons) / prev_period_tons * 100.0) if prev_period_tons > 0 else 0.0

    trucks_required = int(math.ceil(predicted_total_tons / TRUCK_CAPACITY_TONS)) or 1
    peak_idx = int(np.argmax(total_preds))
    peak_day = {
        "date": out_dates[peak_idx].strftime("%Y-%m-%d"),
        "volume": round(float(total_preds[peak_idx]), 3),
        "tons": round(float(total_preds[peak_idx]) * density / 1000.0, 3),
    }

    avg_daily_tons = predicted_total_tons / days if days else 0.0

    # ---- per-day schedule table -----------------------------------------
    schedule = []
    for item in forecast_payload:
        ratio = (item["volume"] / hist_mean) if hist_mean > 0 else 1.0
        schedule.append({
            "date": item["date"],
            "day": datetime.strptime(item["date"], "%Y-%m-%d").strftime("%a"),
            "volume": item["volume"],
            "tons": item["tons"],
            "trucks": max(1, int(math.ceil(item["tons"] / TRUCK_CAPACITY_TONS))),
            "status": _status_for_ratio(ratio),
            "load_index": round(ratio, 2),
            "schedule": _schedule_for_ratio(ratio),
        })

    # ---- waste-type breakdown (area composition) -------------------------
    breakdown_raw = _build_breakdown(area)
    dens_map = {}
    for t in _waste_types():
        try:
            s = pp.aggregate_daily(get_processed(), area, t)
            v, w = float(s[pp.VOLUME_COL].sum()), float(s[pp.WEIGHT_COL].sum())
            dens_map[t] = (w / v) if v > 0 else pp.FALLBACK_DENSITY
        except Exception:  # noqa: BLE001
            dens_map[t] = pp.FALLBACK_DENSITY
    for b in breakdown_raw:
        b["tons"] = round(b["volume"] * dens_map.get(b["waste_type"], pp.FALLBACK_DENSITY) / 1000.0, 3)

    historical = _build_historical(area, types)

    notes = [
        f"Assumed truck payload of {TRUCK_CAPACITY_TONS:g} tons per collection vehicle.",
        f"Recommended collection frequency: {_frequency_recommendation(avg_daily_tons)}.",
        f"Projected average load: {avg_daily_tons:.2f} tons/day across the {days}-day horizon.",
    ]
    if not model_ready:
        notes.append("Trained model unavailable for this selection - a seasonal-naive "
                     "fallback forecast is being shown.")

    return {
        "meta": {
            "area": area,
            "waste_type": waste_type,
            "model": model,
            "days": days,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "model_ready": model_ready,
            "truck_capacity_tons": TRUCK_CAPACITY_TONS,
        },
        "historical": historical,
        "forecast": forecast_payload,
        "metrics": metrics_out,
        "kpis": {
            "predicted_total_volume": round(predicted_total_volume, 2),
            "predicted_total_tons": round(predicted_total_tons, 2),
            "prev_period_tons": round(prev_period_tons, 2),
            "trend_pct": round(trend_pct, 2),
            "trucks_required": trucks_required,
            "trucks_per_day": round(predicted_total_tons / days / TRUCK_CAPACITY_TONS, 2) if days else 0.0,
            "peak_day": peak_day,
            "accuracy_score": metrics_out.get("accuracy_score"),
            "avg_daily_tons": round(avg_daily_tons, 3),
        },
        "breakdown": breakdown_raw,
        "schedule": schedule,
        "recommendations": {
            "collection_frequency": _frequency_recommendation(avg_daily_tons),
            "notes": notes,
        },
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health() -> Dict:
    meta = _STATE["metadata"] or {}
    trained = 0
    if tm.ARTIFACT_DIR.exists():
        trained = len([p for p in tm.ARTIFACT_DIR.iterdir() if p.is_dir()])
    return {
        "status": "ok",
        "dataset": meta,
        "trained_combos": trained,
        "training_in_progress": _STATE["training"],
        "model_cache_size": len(_STATE["model_cache"]),  # type: ignore[arg-type]
    }


@app.get("/api/filters")
def filters() -> Dict:
    meta = _STATE["metadata"] or {}
    return {
        "areas": meta.get("areas", []),
        "waste_types": [ALL_TYPES_LABEL] + list(meta.get("waste_types", [])),
        "models": [
            {"value": "random_forest", "label": "Random Forest"},
            {"value": "xgboost", "label": "XGBoost"},
            {"value": "lstm", "label": "LSTM Neural Net"},
            {"value": "arima", "label": "ARIMA / SARIMAX"},
        ],
        "horizon": {"min": MIN_DAYS, "max": MAX_DAYS, "default": 14},
        "dataset": meta,
    }


@app.get("/api/forecast")
def forecast(
    area: str = Query(..., description="Collection area / zone"),
    waste_type: str = Query(..., description="Waste type or 'All Types'"),
    model: str = Query("random_forest", description="Model key"),
    days: int = Query(14, ge=MIN_DAYS, le=MAX_DAYS, description="Forecast horizon in days"),
) -> Dict:
    meta = _STATE["metadata"] or {}
    if meta and area not in meta.get("areas", []):
        raise HTTPException(status_code=400, detail=f"Unknown area: {area}")
    valid_models = {"random_forest", "xgboost", "lstm", "arima"}
    if model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")
    return _assemble(area, waste_type, model, days)


# ---------------------------------------------------------------------------
# Upload / retrain
# ---------------------------------------------------------------------------
def _retrain_worker(dataset_path: str) -> None:
    """Background worker: preprocess a new dataset then retrain all models."""
    try:
        _STATE["training"] = True
        pp.run_pipeline(dataset_path)
        load_dataset()
        tm.train_all(force=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[upload] retraining failed: {exc}")
    finally:
        _STATE["training"] = False
        _STATE["model_cache"] = {}


@app.post("/api/upload")
async def upload(background: BackgroundTasks,
                 file: UploadFile = File(...),
                 retrain: bool = Query(True, description="Retrain models after upload")) -> Dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    try:
        content = await file.read()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read upload: {exc}") from exc

    pp.DATA_DIR.mkdir(parents=True, exist_ok=True)
    saved_path = pp.DATA_DIR / f"uploaded_{datetime.now():%Y%m%d_%H%M%S}.csv"
    saved_path.write_bytes(content)

    # validate + build processed frame synchronously so the UI gets instant feedback
    try:
        pp.save_active_dataset(saved_path)
        processed, meta = pp.run_pipeline(saved_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422,
                            detail=f"Dataset could not be parsed: {exc}") from exc

    # invalidate stale artefacts from the previous dataset
    if tm.ARTIFACT_DIR.exists():
        shutil.rmtree(tm.ARTIFACT_DIR, ignore_errors=True)
    tm.ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    load_dataset()

    _STATE["last_upload"] = {"filename": file.filename,
                             "saved_as": saved_path.name,
                             "at": datetime.now().isoformat(timespec="seconds")}

    if retrain:
        _STATE["training"] = True
        background.add_task(_retrain_worker, str(saved_path))

    return {
        "status": "accepted",
        "filename": file.filename,
        "retraining": bool(retrain),
        "dataset": meta.to_dict(),
        "message": ("Dataset ingested. Model retraining started in the background."
                    if retrain else "Dataset ingested."),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
