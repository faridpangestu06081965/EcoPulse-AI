"""
EcoPulse - Model Training & Evaluation
======================================
Trains and evaluates four forecasting models for every (Area x Waste Type)
daily waste-volume series:

    1. ARIMA / SARIMAX        (statsmodels)
    2. LSTM Neural Network    (TensorFlow / Keras)
    3. Random Forest Regressor (scikit-learn)
    4. XGBoost Regressor      (xgboost)

Each model is evaluated on a held-out tail window (RMSE / MAE / R2 / MAPE)
and the fitted artefacts are persisted under ``saved_models/`` together with
a global ``metrics.json`` report consumed by the FastAPI layer.

Every combination is trained on the *same* protocol:
    * split  ->  last ``TEST_HORIZON`` days are the test window
    * fit    ->  on the remaining history only
    * predict->  ``TEST_HORIZON + MAX_FORECAST`` steps recursively from the
                 end of the training context (first 30 = test, rest = future)

This keeps forecasting consistent across all four model families.

CLI
---
    python train_models.py                # train every combination
    python train_models.py --force        # retrain even if artefacts exist
    python train_models.py --area "West Zone" --type Organic
"""

from __future__ import annotations

import argparse
import json
import os
import time
import warnings
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Keep TensorFlow quiet & single-thread friendly before it is imported lazily.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import preprocessing as pp

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TEST_HORIZON = 30          # days held out for evaluation
MAX_FORECAST = 30          # max forecast horizon requested by the dashboard (7..30)
LOOKBACK = 14              # LSTM sequence length
MODEL_KEYS = ["arima", "lstm", "random_forest", "xgboost"]

MODELS_DIR = pp.MODELS_DIR
MODELS_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR = MODELS_DIR / "models"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
METRICS_PATH = MODELS_DIR / "metrics.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def slugify(area: str, waste_type: str) -> str:
    """Stable, filesystem-safe identifier for an (area, waste_type) combo."""
    def _clean(s: str) -> str:
        return "".join(c if c.isalnum() else "_" for c in s.strip()).strip("_")
    return f"{_clean(area)}__{_clean(waste_type)}"


def combo_artifact_dir(area: str, waste_type: str) -> Path:
    return ARTIFACT_DIR / slugify(area, waste_type)


def compute_metrics(actual: np.ndarray, predicted: np.ndarray) -> Dict[str, float]:
    """RMSE / MAE / R2 / MAPE for a pair of 1-D arrays."""
    actual = np.asarray(actual, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    mask = np.isfinite(actual) & np.isfinite(predicted)
    a, p = actual[mask], predicted[mask]
    if a.size == 0:
        return {"rmse": float("nan"), "mae": float("nan"),
                "r2": float("nan"), "mape": float("nan")}

    rmse = float(np.sqrt(mean_squared_error(a, p)))
    mae = float(mean_absolute_error(a, p))
    r2 = float(r2_score(a, p)) if a.size > 1 and np.var(a) > 0 else float("nan")
    denom = np.where(np.abs(a) < 1e-6, 1e-6, np.abs(a))
    mape = float(np.mean(np.abs((a - p) / denom)) * 100.0)
    return {"rmse": round(rmse, 4), "mae": round(mae, 4),
            "r2": round(r2, 4) if np.isfinite(r2) else None,
            "mape": round(mape, 2)}


def one_step_predictions_tree(model, values: np.ndarray, dates, start: int,
                              end: int) -> np.ndarray:
    """Teacher-forced (1-step-ahead) predictions for tree models over [start, end)."""
    rows = [pp.feature_row(values, dates, i) for i in range(start, end)]
    X = _safe_feature_matrix(rows, fallback=float(np.mean(values[:start])))
    return np.asarray(model.predict(X), dtype=float).ravel()


def one_step_predictions_lstm(model, scaler, values: np.ndarray, start: int,
                              end: int) -> np.ndarray:
    """Teacher-forced (1-step-ahead) predictions for the LSTM over [start, end)."""
    scaled = scaler.transform(np.asarray(values, dtype=float).reshape(-1, 1)).flatten()
    seqs = [scaled[i - LOOKBACK:i] for i in range(start, end)]
    X = np.asarray(seqs).reshape(-1, LOOKBACK, 1)
    pred_scaled = np.asarray(model.predict(X, verbose=0), dtype=float).ravel()
    return scaler.inverse_transform(pred_scaled.reshape(-1, 1)).ravel()


def _safe_feature_matrix(rows: List[Dict[str, float]], fallback: float) -> np.ndarray:
    X = np.array([[r[c] for c in pp.FEATURE_COLS] for r in rows], dtype=float)
    if X.size == 0:
        return X
    col_medians = np.nanmedian(X, axis=0)
    col_medians = np.where(np.isfinite(col_medians), col_medians, fallback)
    inds = np.where(~np.isfinite(X))
    X[inds] = np.take(col_medians, inds[1])
    return X


# ---------------------------------------------------------------------------
# Individual model training
# ---------------------------------------------------------------------------
def train_random_forest(X: np.ndarray, y: np.ndarray) -> RandomForestRegressor:
    model = RandomForestRegressor(
        n_estimators=300,
        max_depth=12,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X, y)
    return model


def train_xgboost(X: np.ndarray, y: np.ndarray):
    from xgboost import XGBRegressor

    model = XGBRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        objective="reg:squarederror",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X, y, verbose=False)
    return model


def train_lstm(values: np.ndarray):
    """Train a small LSTM on scaled volume sequences. Returns (model, scaler)."""
    from tensorflow.keras.callbacks import EarlyStopping
    from tensorflow.keras.layers import Dense, Dropout, Input, LSTM
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.optimizers import Adam
    from sklearn.preprocessing import MinMaxScaler

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(values.reshape(-1, 1)).flatten()

    X_seq, y_seq = [], []
    for i in range(LOOKBACK, len(scaled)):
        X_seq.append(scaled[i - LOOKBACK:i])
        y_seq.append(scaled[i])
    X_seq = np.array(X_seq).reshape(-1, LOOKBACK, 1)
    y_seq = np.array(y_seq)

    model = Sequential([
        Input(shape=(LOOKBACK, 1)),
        LSTM(32, activation="tanh"),
        Dropout(0.1),
        Dense(1),
    ])
    model.compile(optimizer=Adam(learning_rate=0.01), loss="mse")
    model.fit(
        X_seq, y_seq,
        epochs=40,
        batch_size=32,
        validation_split=0.1,
        shuffle=False,
        callbacks=[EarlyStopping(monitor="val_loss", patience=5,
                                 restore_best_weights=True)],
        verbose=0,
    )
    return model, scaler


def train_arima(values: np.ndarray):
    """Fit a seasonal ARIMA (SARIMAX) model with graceful fallbacks."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    configs = [
        dict(order=(1, 1, 1), seasonal_order=(1, 0, 1, 7)),
        dict(order=(1, 1, 1), seasonal_order=(0, 0, 0, 0)),
        dict(order=(2, 1, 1), seasonal_order=(0, 0, 0, 0)),
        dict(order=(1, 0, 1), seasonal_order=(0, 0, 0, 0)),
    ]
    last_err: Optional[Exception] = None
    for cfg in configs:
        try:
            model = SARIMAX(
                values,
                order=cfg["order"],
                seasonal_order=cfg["seasonal_order"],
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            res = model.fit(disp=False, maxiter=60)
            return res
        except Exception as exc:  # noqa: BLE001 - try the next simpler config
            last_err = exc
    raise RuntimeError(f"ARIMA fitting failed for all configs: {last_err}")


# ---------------------------------------------------------------------------
# Recursive / multi-step forecasting (shared with the FastAPI layer)
# ---------------------------------------------------------------------------
def forecast_tree(model, context_values: np.ndarray, context_dates,
                  steps: int) -> Tuple[np.ndarray, List[pd.Timestamp]]:
    """Recursive multi-step forecast for tree-based models."""
    hist = list(np.asarray(context_values, dtype=float))
    dates = list(pd.DatetimeIndex(context_dates))
    preds: List[float] = []

    for _ in range(steps):
        next_date = dates[-1] + pd.Timedelta(days=1)
        dates.append(next_date)
        i = len(hist)
        vals = np.asarray(hist, dtype=float)
        row = pp.feature_row(vals, pd.DatetimeIndex(dates), i)
        x = _safe_feature_matrix([row], fallback=float(np.mean(vals[-7:])))
        yhat = float(np.asarray(model.predict(x)).ravel()[0])
        yhat = max(0.0, yhat)
        preds.append(yhat)
        hist.append(yhat)

    return np.asarray(preds), dates[-steps:]


def forecast_lstm(model, scaler, context_values: np.ndarray, context_dates,
                  steps: int) -> Tuple[np.ndarray, List[pd.Timestamp]]:
    """Recursive multi-step forecast for the LSTM model."""
    scaled = scaler.transform(np.asarray(context_values, dtype=float)
                              .reshape(-1, 1)).flatten()
    dates = list(pd.DatetimeIndex(context_dates))
    preds: List[float] = []

    for _ in range(steps):
        seq = scaled[-LOOKBACK:].reshape(1, LOOKBACK, 1)
        yhat_scaled = float(model.predict(seq, verbose=0).ravel()[0])
        scaled = np.append(scaled, yhat_scaled)
        yhat = float(scaler.inverse_transform([[yhat_scaled]])[0, 0])
        yhat = max(0.0, yhat)
        preds.append(yhat)
        dates.append(dates[-1] + pd.Timedelta(days=1))

    return np.asarray(preds), dates[-steps:]


def forecast_arima(res, context_dates, steps: int):
    """Return (mean, lower, upper, dates) for an ARIMA/SARIMAX fit."""
    fc = res.get_forecast(steps=steps)
    mean = np.asarray(fc.predicted_mean, dtype=float)
    conf = np.asarray(fc.conf_int(alpha=0.2), dtype=float)  # 80% interval
    last = pd.DatetimeIndex(context_dates)[-1]
    dates = [last + pd.Timedelta(days=i + 1) for i in range(steps)]
    return mean, conf[:, 0], conf[:, 1], dates


# ---------------------------------------------------------------------------
# Per-combination training routine
# ---------------------------------------------------------------------------
def train_combo(series: pd.DataFrame, area: str, waste_type: str,
                force: bool = False) -> Dict:
    """Train + evaluate all four models for one (area, waste_type) series."""
    out_dir = combo_artifact_dir(area, waste_type)
    metrics_file = out_dir / "metrics.json"

    if metrics_file.exists() and not force:
        with open(metrics_file, "r", encoding="utf-8") as fh:
            return json.load(fh)

    out_dir.mkdir(parents=True, exist_ok=True)

    values = series[pp.VOLUME_COL].to_numpy(dtype=float)
    weights = series[pp.WEIGHT_COL].to_numpy(dtype=float)
    dates = pd.DatetimeIndex(series.index)

    n = len(values)
    if n < pp.MIN_HISTORY + TEST_HORIZON + 5:
        raise ValueError(f"Not enough data for {area}/{waste_type}: {n} days")

    train_end = n - TEST_HORIZON
    ctx_values = values[:train_end]
    ctx_dates = dates[:train_end]
    actual_test = values[train_end:train_end + TEST_HORIZON]
    steps = TEST_HORIZON + MAX_FORECAST

    # bulk density (kg / m3) to convert forecast volume -> weight
    with np.errstate(divide="ignore", invalid="ignore"):
        dens = np.where(values > 0, weights / values, np.nan)
    density = float(np.nanmedian(dens)) if np.isfinite(np.nanmedian(dens)) else pp.FALLBACK_DENSITY

    metrics: Dict[str, Dict] = {}
    multi_step: Dict[str, Dict] = {}
    timings: Dict[str, float] = {}
    artifact: Dict = {
        "area": area,
        "waste_type": waste_type,
        "density": density,
        "context_values": ctx_values,
        "context_dates": ctx_dates,
        "train_end": int(train_end),
        "test_horizon": TEST_HORIZON,
        "max_forecast": MAX_FORECAST,
        "lookback": LOOKBACK,
        "last_date": dates[-1],
        "models": {},
    }
    full_dates = dates  # full series dates (train + test)

    # ---- Random Forest ---------------------------------------------------
    try:
        t0 = time.time()
        X, y = pp.build_supervised(series.iloc[:train_end])
        X_arr = _safe_feature_matrix(X.to_dict("records"), fallback=float(y.mean()))
        rf = train_random_forest(X_arr, y.to_numpy())
        pred, _ = forecast_tree(rf, ctx_values, ctx_dates, steps)
        one_step = one_step_predictions_tree(rf, values, full_dates, train_end, n)
        metrics["random_forest"] = compute_metrics(actual_test, one_step)
        multi_step["random_forest"] = compute_metrics(actual_test, pred[:TEST_HORIZON])
        artifact["models"]["random_forest"] = rf
        timings["random_forest"] = round(time.time() - t0, 2)
    except Exception as exc:  # noqa: BLE001
        metrics["random_forest"] = {"error": str(exc)}

    # ---- XGBoost ---------------------------------------------------------
    try:
        t0 = time.time()
        X, y = pp.build_supervised(series.iloc[:train_end])
        X_arr = _safe_feature_matrix(X.to_dict("records"), fallback=float(y.mean()))
        xgb = train_xgboost(X_arr, y.to_numpy())
        pred, _ = forecast_tree(xgb, ctx_values, ctx_dates, steps)
        one_step = one_step_predictions_tree(xgb, values, full_dates, train_end, n)
        metrics["xgboost"] = compute_metrics(actual_test, one_step)
        multi_step["xgboost"] = compute_metrics(actual_test, pred[:TEST_HORIZON])
        artifact["models"]["xgboost"] = xgb
        timings["xgboost"] = round(time.time() - t0, 2)
    except Exception as exc:  # noqa: BLE001
        metrics["xgboost"] = {"error": str(exc)}

    # ---- LSTM ------------------------------------------------------------
    try:
        t0 = time.time()
        lstm, scaler = train_lstm(ctx_values)
        pred, _ = forecast_lstm(lstm, scaler, ctx_values, ctx_dates, steps)
        one_step = one_step_predictions_lstm(lstm, scaler, values, train_end, n)
        metrics["lstm"] = compute_metrics(actual_test, one_step)
        multi_step["lstm"] = compute_metrics(actual_test, pred[:TEST_HORIZON])
        lstm.save(out_dir / "lstm.keras")
        joblib.dump(scaler, out_dir / "lstm_scaler.joblib")
        artifact["models"]["lstm"] = {"saved": True}
        timings["lstm"] = round(time.time() - t0, 2)
    except Exception as exc:  # noqa: BLE001
        metrics["lstm"] = {"error": str(exc)}

    # ---- ARIMA / SARIMAX -------------------------------------------------
    try:
        t0 = time.time()
        res = train_arima(ctx_values)
        mean, lower, upper, _ = forecast_arima(res, ctx_dates, steps)
        try:  # teacher-forced 1-step via sample extension (no refit)
            res_ext = res.append(actual_test, refit=False)
            one_step = np.asarray(
                res_ext.get_prediction(start=train_end, end=n - 1,
                                       dynamic=False).predicted_mean,
                dtype=float)
        except Exception:  # noqa: BLE001 - fall back to the multi-step head
            one_step = mean[:TEST_HORIZON]
        metrics["arima"] = compute_metrics(actual_test, one_step)
        multi_step["arima"] = compute_metrics(actual_test, mean[:TEST_HORIZON])
        joblib.dump(res, out_dir / "arima.joblib")
        artifact["models"]["arima"] = {"saved": True}
        timings["arima"] = round(time.time() - t0, 2)
    except Exception as exc:  # noqa: BLE001
        metrics["arima"] = {"error": str(exc)}

    # ---- persist tree artefacts -----------------------------------------
    joblib.dump(
        {
            "area": area,
            "waste_type": waste_type,
            "density": density,
            "context_values": ctx_values,
            "context_dates": ctx_dates,
            "train_end": int(train_end),
            "test_horizon": TEST_HORIZON,
            "max_forecast": MAX_FORECAST,
            "lookback": LOOKBACK,
            "last_date": dates[-1],
            "random_forest": artifact["models"].get("random_forest"),
            "xgboost": artifact["models"].get("xgboost"),
            "actual_test": actual_test,
        },
        out_dir / "models.joblib",
    )

    record = {
        "area": area,
        "waste_type": waste_type,
        "n_days": int(n),
        "density": round(density, 3),
        "train_days": int(train_end),
        "test_days": TEST_HORIZON,
        "metrics": metrics,
        "multi_step_metrics": multi_step,
        "timings_sec": timings,
    }
    with open(metrics_file, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=2)
    return record


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def train_all(force: bool = False, only_area: Optional[str] = None,
              only_type: Optional[str] = None) -> Dict:
    processed = pp.load_processed()
    combos = (
        processed[[pp.AREA_COL, pp.TYPE_COL]]
        .drop_duplicates()
        .sort_values([pp.AREA_COL, pp.TYPE_COL])
    )

    metrics_report: Dict = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "test_horizon": TEST_HORIZON,
        "max_forecast": MAX_FORECAST,
        "combos": {},
    }

    total = len(combos)
    done = 0
    for _, row in combos.iterrows():
        area, waste_type = row[pp.AREA_COL], row[pp.TYPE_COL]
        if only_area and area != only_area:
            continue
        if only_type and waste_type != only_type:
            continue

        done += 1
        t0 = time.time()
        try:
            series = pp.aggregate_daily(processed, area, waste_type)
            record = train_combo(series, area, waste_type, force=force)
            slug = slugify(area, waste_type)
            metrics_report["combos"][slug] = record
            best = _best_model(record["metrics"])
            print(f"[{done:>2}/{total}] {area:<16} | {waste_type:<8} | "
                  f"best={best[0]:<14} RMSE={best[1]:.3f} "
                  f"({time.time() - t0:5.1f}s)")
        except Exception as exc:  # noqa: BLE001
            print(f"[{done:>2}/{total}] {area:<16} | {waste_type:<8} | "
                  f"FAILED: {exc}")

        # persist incrementally so a long run is resumable
        with open(METRICS_PATH, "w", encoding="utf-8") as fh:
            json.dump(metrics_report, fh, indent=2)

    print("=" * 70)
    print(f"Training complete -> {METRICS_PATH}")
    print(f"Combinations trained: {len(metrics_report['combos'])}")
    print("=" * 70)
    return metrics_report


def _best_model(metrics: Dict[str, Dict]) -> Tuple[str, float]:
    best_name, best_rmse = "n/a", float("inf")
    for name, m in metrics.items():
        if isinstance(m, dict) and isinstance(m.get("rmse"), (int, float)):
            if m["rmse"] < best_rmse:
                best_name, best_rmse = name, m["rmse"]
    return best_name, (best_rmse if np.isfinite(best_rmse) else 0.0)


def main() -> None:
    parser = argparse.ArgumentParser(description="EcoPulse model training pipeline")
    parser.add_argument("--force", action="store_true", help="Retrain existing combos")
    parser.add_argument("--area", default=None, help="Only train this area")
    parser.add_argument("--type", default=None, help="Only train this waste type")
    args = parser.parse_args()

    if not pp.PROCESSED_PATH.exists():
        print("Processed dataset not found, running preprocessing first...")
        pp.run_pipeline()

    print("=" * 70)
    print("EcoPulse model training (ARIMA | LSTM | RandomForest | XGBoost)")
    print("=" * 70)
    train_all(force=args.force, only_area=args.area, only_type=args.type)


if __name__ == "__main__":
    main()
