"""
EcoPulse - Data Preprocessing & Feature Engineering
====================================================
Handles loading the raw municipal solid waste dataset, cleaning it
(missing values, outliers, datetime parsing), aggregating daily waste
volume by Area and Waste Type, and engineering lag / rolling / calendar
time features used by the forecasting models.

This module is intentionally decoupled from the web layer so that it can be
executed stand-alone (CLI) or imported by ``train_models.py`` / ``main.py``.

CLI
---
    python preprocessing.py --input ../Smart_Solid_Waste_Management_Dataset.csv \
                            --out ./data
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
MODELS_DIR = BACKEND_DIR / "saved_models"

# The dataset shipped in the user's workspace (primary / default dataset).
DEFAULT_DATASET = PROJECT_ROOT / "Smart_Solid_Waste_Management_Dataset.csv"
# Active dataset that the API serves. On first run it falls back to DEFAULT_DATASET.
ACTIVE_DATASET = DATA_DIR / "active_dataset.csv"
PROCESSED_PATH = DATA_DIR / "processed_daily.csv"
METADATA_PATH = DATA_DIR / "metadata.json"

# Canonical column names used everywhere downstream.
DATE_COL = "date"
AREA_COL = "area"
TYPE_COL = "waste_type"
VOLUME_COL = "volume_m3"
WEIGHT_COL = "weight_kg"
COUNT_COL = "records"

# Feature-engineering configuration (shared with the API for recursive forecasting).
LAGS: List[int] = [1, 2, 3, 7, 14, 21, 30]
ROLLING_WINDOWS: List[int] = [7, 14, 30]
CALENDAR_FEATURES: List[str] = ["dow", "month", "doy", "is_weekend", "day", "week"]

# The minimum number of historical days required before we consider lag features valid.
MIN_HISTORY = max(LAGS + ROLLING_WINDOWS)


def feature_columns() -> List[str]:
    """Ordered list of engineered feature names (must stay stable)."""
    cols: List[str] = [f"lag_{lag}" for lag in LAGS]
    for w in ROLLING_WINDOWS:
        cols.append(f"roll_mean_{w}")
        cols.append(f"roll_std_{w}")
    cols.extend(CALENDAR_FEATURES)
    return cols


FEATURE_COLS: List[str] = feature_columns()

# Approximate bulk density (kg / m3) used to derive weight when only volume exists.
FALLBACK_DENSITY = 300.0


# ---------------------------------------------------------------------------
# Column auto-detection (makes the /upload endpoint tolerant to other schemas)
# ---------------------------------------------------------------------------
_DATE_CANDIDATES = [
    "collection_date", "report_date", "date", "load_time", "timestamp",
    "datetime", "day", "period",
]
_AREA_CANDIDATES = [
    "collection_zone", "zone", "area", "district", "region",
    "dropoff_site", "site", "ward_number",
]
_TYPE_CANDIDATES = [
    "waste_category", "sub_waste_type", "waste_type", "load_type",
    "route_type", "category", "type", "stream",
]
_VOLUME_CANDIDATES = [
    "waste_volume_m3", "volume_m3", "volume", "waste_weight_kg", "load_weight",
    "weight",
]
_WEIGHT_CANDIDATES = [
    "waste_weight_kg", "load_weight", "weight_kg", "weight", "mass",
]


def _find_column(columns: List[str], candidates: List[str]) -> str | None:
    """Case/space-insensitive lookup of the first matching candidate column."""
    normalized = {c.strip().lower(): c for c in columns}
    for cand in candidates:
        if cand in normalized:
            return normalized[cand]
    # fall back to a contains-match
    for cand in candidates:
        for low, original in normalized.items():
            if cand in low:
                return original
    return None


@dataclass
class DatasetMetadata:
    """Small summary of the active dataset surfaced through the API."""

    name: str
    rows: int
    areas: List[str]
    waste_types: List[str]
    start_date: str
    end_date: str
    total_days: int
    total_volume_m3: float
    total_weight_tons: float

    def to_dict(self) -> Dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Loading + standardisation
# ---------------------------------------------------------------------------
def load_raw(path: str | Path) -> pd.DataFrame:
    """Load a raw CSV, tolerating BOM / encoding quirks."""
    path = Path(path)
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(path, encoding="utf-8", engine="python")


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Map an arbitrary waste CSV onto the canonical schema
    ``[date, area, waste_type, volume_m3, weight_kg]``.
    """
    cols = list(df.columns)

    date_src = _find_column(cols, _DATE_CANDIDATES)
    area_src = _find_column(cols, _AREA_CANDIDATES)
    type_src = _find_column(cols, _TYPE_CANDIDATES)
    vol_src = _find_column(cols, _VOLUME_CANDIDATES)
    weight_src = _find_column(cols, _WEIGHT_CANDIDATES)

    if date_src is None or vol_src is None:
        raise ValueError(
            "Could not detect required date / volume columns. "
            f"Available columns: {cols}"
        )

    out = pd.DataFrame()
    out[DATE_COL] = df[date_src]
    out[AREA_COL] = df[area_src].astype(str) if area_src else "All Zones"
    out[TYPE_COL] = df[type_src].astype(str) if type_src else "Mixed"

    vol_is_weight = (vol_src == weight_src) or ("weight" in vol_src.lower())
    numeric_vol = pd.to_numeric(df[vol_src], errors="coerce")
    if vol_is_weight:
        # Only weight available -> derive an approximate volume from bulk density.
        numeric_vol = numeric_vol / FALLBACK_DENSITY
    out[VOLUME_COL] = numeric_vol

    if weight_src is not None and weight_src != vol_src:
        out[WEIGHT_COL] = pd.to_numeric(df[weight_src], errors="coerce")
    else:
        out[WEIGHT_COL] = out[VOLUME_COL] * FALLBACK_DENSITY

    return out


# ---------------------------------------------------------------------------
# Cleaning
# ---------------------------------------------------------------------------
def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean the standardised frame:
      * parse datetime & drop invalid rows
      * normalise categorical labels
      * impute missing numerics
      * winsorize outliers (per Area x Waste Type, 1st/99th percentile)
    """
    df = df.copy()

    # --- datetime parsing -------------------------------------------------
    df[DATE_COL] = pd.to_datetime(df[DATE_COL], errors="coerce", format="mixed")
    df = df.dropna(subset=[DATE_COL])
    df[DATE_COL] = df[DATE_COL].dt.normalize()

    # --- categorical hygiene ---------------------------------------------
    df[AREA_COL] = df[AREA_COL].fillna("Unknown").astype(str).str.strip()
    df[TYPE_COL] = df[TYPE_COL].fillna("Unknown").astype(str).str.strip()
    df.loc[df[AREA_COL].isin(["", "nan", "None"]), AREA_COL] = "Unknown"
    df.loc[df[TYPE_COL].isin(["", "nan", "None"]), TYPE_COL] = "Unknown"

    # --- duplicate removal ------------------------------------------------
    df = df.drop_duplicates()

    # --- numeric coercion & imputation -----------------------------------
    for col in (VOLUME_COL, WEIGHT_COL):
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].clip(lower=0)

    df[VOLUME_COL] = df.groupby([AREA_COL, TYPE_COL])[VOLUME_COL].transform(
        lambda s: s.fillna(s.median())
    )
    df[VOLUME_COL] = df[VOLUME_COL].fillna(df[VOLUME_COL].median())
    df[WEIGHT_COL] = df.groupby([AREA_COL, TYPE_COL])[WEIGHT_COL].transform(
        lambda s: s.fillna(s.median())
    )
    df[WEIGHT_COL] = df[WEIGHT_COL].fillna(df[WEIGHT_COL].median())
    # If weight was not recoverable, derive it from volume * median density.
    density = (df[WEIGHT_COL] / df[VOLUME_COL].replace(0, np.nan)).median()
    density = density if np.isfinite(density) and density > 0 else FALLBACK_DENSITY
    df[WEIGHT_COL] = df[WEIGHT_COL].fillna(df[VOLUME_COL] * density)

    # --- outlier winsorization (keeps the daily series continuous) -------
    def _winsorize(s: pd.Series) -> pd.Series:
        if s.notna().sum() < 20:
            return s
        lo, hi = s.quantile(0.01), s.quantile(0.99)
        if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
            return s
        return s.clip(lower=lo, upper=hi)

    df[VOLUME_COL] = (
        df.groupby([AREA_COL, TYPE_COL])[VOLUME_COL].transform(_winsorize)
    )
    df[WEIGHT_COL] = df[WEIGHT_COL].clip(lower=0)

    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Aggregation to a continuous daily series
# ---------------------------------------------------------------------------
def aggregate_daily(df: pd.DataFrame, area: str, waste_type: str) -> pd.DataFrame:
    """
    Aggregate a single (area, waste_type) pair to a *continuous* daily series
    with no date gaps (missing days interpolated, edges forward/back-filled).
    """
    subset = df[(df[AREA_COL] == area) & (df[TYPE_COL] == waste_type)]
    daily = (
        subset.groupby(DATE_COL)
        .agg(**{VOLUME_COL: (VOLUME_COL, "sum"),
                WEIGHT_COL: (WEIGHT_COL, "sum"),
                COUNT_COL: (VOLUME_COL, "size")})
        .sort_index()
    )
    if daily.empty:
        raise ValueError(f"No data for area={area!r} / waste_type={waste_type!r}")

    full_idx = pd.date_range(daily.index.min(), daily.index.max(), freq="D")
    daily = daily.reindex(full_idx)
    daily.index.name = DATE_COL
    daily[COUNT_COL] = daily[COUNT_COL].fillna(0).astype(int)

    for col in (VOLUME_COL, WEIGHT_COL):
        daily[col] = daily[col].interpolate(method="time", limit_direction="both")
        daily[col] = daily[col].bfill().ffill().fillna(0.0).clip(lower=0)

    return daily


def build_processed(df: pd.DataFrame) -> pd.DataFrame:
    """Return the long, cleaned, daily-aggregated frame for *all* combos."""
    frames: List[pd.DataFrame] = []
    for (area, waste_type), sub in df.groupby([AREA_COL, TYPE_COL]):
        agg = aggregate_daily(sub.assign(**{AREA_COL: area, TYPE_COL: waste_type}),
                              area, waste_type)
        agg = agg.reset_index()
        agg[AREA_COL] = area
        agg[TYPE_COL] = waste_type
        frames.append(agg)
    processed = pd.concat(frames, ignore_index=True)
    return processed[["date", AREA_COL, TYPE_COL, VOLUME_COL, WEIGHT_COL, COUNT_COL]]


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def feature_row(values: np.ndarray, dates: pd.DatetimeIndex, i: int) -> Dict[str, float]:
    """
    Build a single engineered feature vector for position ``i`` of the series.

    ``values`` holds the (possibly partially predicted) volume history and
    ``dates`` the matching dates. Used both for supervised training and for
    recursive multi-step forecasting in the API.
    """
    row: Dict[str, float] = {}
    for lag in LAGS:
        row[f"lag_{lag}"] = float(values[i - lag]) if i - lag >= 0 else np.nan

    for w in ROLLING_WINDOWS:
        start = max(0, i - w)
        window = values[start:i]
        if window.size == 0:
            row[f"roll_mean_{w}"] = np.nan
            row[f"roll_std_{w}"] = np.nan
        else:
            row[f"roll_mean_{w}"] = float(np.mean(window))
            row[f"roll_std_{w}"] = float(np.std(window, ddof=0))

    d = dates[i]
    row["dow"] = float(d.dayofweek)
    row["month"] = float(d.month)
    row["doy"] = float(d.dayofyear)
    row["is_weekend"] = float(d.dayofweek >= 5)
    row["day"] = float(d.day)
    row["week"] = float(d.isocalendar().week)
    return {k: row[k] for k in FEATURE_COLS}


def build_supervised(series: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Turn a daily volume series into an (X, y) supervised learning problem.
    ``y[i]`` is the volume at position ``i`` predicted from features of ``i``.
    """
    values = series[VOLUME_COL].to_numpy(dtype=float)
    dates = pd.DatetimeIndex(series.index)
    rows: List[Dict[str, float]] = []
    targets: List[float] = []
    for i in range(MIN_HISTORY, len(values)):
        rows.append(feature_row(values, dates, i))
        targets.append(float(values[i]))
    X = pd.DataFrame(rows, columns=FEATURE_COLS)
    y = pd.Series(targets, name=VOLUME_COL)
    return X, y


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------
def resolve_dataset_path() -> Path:
    """Return the dataset the API should currently serve."""
    if ACTIVE_DATASET.exists():
        return ACTIVE_DATASET
    return DEFAULT_DATASET


def save_active_dataset(src: str | Path) -> Path:
    """Copy an uploaded dataset into the active slot."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    src = Path(src)
    data = src.read_bytes()
    ACTIVE_DATASET.write_bytes(data)
    return ACTIVE_DATASET


def build_metadata(processed: pd.DataFrame, name: str) -> DatasetMetadata:
    areas = sorted(processed[AREA_COL].unique().tolist())
    types = sorted(processed[TYPE_COL].unique().tolist())
    return DatasetMetadata(
        name=name,
        rows=int(processed[COUNT_COL].sum()),
        areas=areas,
        waste_types=types,
        start_date=processed[DATE_COL].min().strftime("%Y-%m-%d"),
        end_date=processed[DATE_COL].max().strftime("%Y-%m-%d"),
        total_days=int(processed[DATE_COL].nunique()),
        total_volume_m3=round(float(processed[VOLUME_COL].sum()), 2),
        total_weight_tons=round(float(processed[WEIGHT_COL].sum()) / 1000.0, 2),
    )


def run_pipeline(dataset_path: str | Path | None = None,
                 out_dir: Path = DATA_DIR) -> Tuple[pd.DataFrame, DatasetMetadata]:
    """Full preprocessing pipeline: load -> standardize -> clean -> aggregate."""
    dataset_path = Path(dataset_path) if dataset_path else resolve_dataset_path()
    raw = load_raw(dataset_path)
    std = standardize_columns(raw)
    cleaned = clean_data(std)
    processed = build_processed(cleaned)
    meta = build_metadata(processed, dataset_path.name)

    out_dir.mkdir(parents=True, exist_ok=True)
    processed.to_csv(out_dir / PROCESSED_PATH.name, index=False)
    with open(out_dir / METADATA_PATH.name, "w", encoding="utf-8") as fh:
        json.dump(meta.to_dict(), fh, indent=2)

    return processed, meta


def load_processed(path: Path = PROCESSED_PATH) -> pd.DataFrame:
    """Load the cached processed frame (parsing the date column)."""
    df = pd.read_csv(path, parse_dates=[DATE_COL])
    return df


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="EcoPulse preprocessing pipeline")
    parser.add_argument("--input", default=None, help="Path to the raw CSV dataset")
    parser.add_argument("--out", default=str(DATA_DIR), help="Output directory")
    args = parser.parse_args()

    processed, meta = run_pipeline(args.input, Path(args.out))

    print("=" * 60)
    print("EcoPulse preprocessing complete")
    print("=" * 60)
    print(f"  Dataset      : {meta.name}")
    print(f"  Raw rows     : {meta.rows}")
    print(f"  Date range   : {meta.start_date} -> {meta.end_date} ({meta.total_days} days)")
    print(f"  Areas ({len(meta.areas)})     : {', '.join(meta.areas)}")
    print(f"  Waste types  : {', '.join(meta.waste_types)}")
    print(f"  Total volume : {meta.total_volume_m3:,.1f} m3")
    print(f"  Total weight : {meta.total_weight_tons:,.1f} tons")
    print(f"  Output       : {Path(args.out) / PROCESSED_PATH.name}")
    print("=" * 60)


if __name__ == "__main__":
    main()
