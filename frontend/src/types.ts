// Shared API contract types for the EcoPulse dashboard.

export interface ModelOption {
  value: ModelKey
  label: string
}

export type ModelKey = 'random_forest' | 'xgboost' | 'lstm' | 'arima'

export interface DatasetMeta {
  name: string
  rows: number
  areas: string[]
  waste_types: string[]
  start_date: string
  end_date: string
  total_days: number
  total_volume_m3: number
  total_weight_tons: number
}

export interface FiltersResponse {
  areas: string[]
  waste_types: string[]
  models: ModelOption[]
  horizon: { min: number; max: number; default: number }
  dataset: DatasetMeta
}

export interface HistoricalPoint {
  date: string
  volume: number
  tons: number
}

export interface ForecastPoint {
  date: string
  volume: number
  tons: number
  lower_m3: number
  upper_m3: number
}

export interface Metrics {
  rmse: number | null
  mae: number | null
  r2: number | null
  accuracy_score: number | null
}

export interface PeakDay {
  date: string
  volume: number
  tons: number
}

export interface Kpis {
  predicted_total_volume: number
  predicted_total_tons: number
  prev_period_tons: number
  trend_pct: number
  trucks_required: number
  trucks_per_day: number
  peak_day: PeakDay
  accuracy_score: number | null
  avg_daily_tons: number
}

export interface BreakdownItem {
  waste_type: string
  volume: number
  tons: number
  share: number
}

export type ForecastStatus = 'Normal' | 'High Load' | 'Critical Spike'

export interface ScheduleRow {
  date: string
  day: string
  volume: number
  tons: number
  trucks: number
  status: ForecastStatus
  load_index: number
  schedule: string
}

export interface ForecastMeta {
  area: string
  waste_type: string
  model: ModelKey
  days: number
  generated_at: string
  model_ready: boolean
  truck_capacity_tons: number
}

export interface Recommendations {
  collection_frequency: string
  notes: string[]
}

export interface ForecastResponse {
  meta: ForecastMeta
  historical: HistoricalPoint[]
  forecast: ForecastPoint[]
  metrics: Metrics
  kpis: Kpis
  breakdown: BreakdownItem[]
  schedule: ScheduleRow[]
  recommendations: Recommendations
}

export interface UploadResponse {
  status: string
  filename: string
  retraining: boolean
  dataset: DatasetMeta
  message: string
}

export interface HealthResponse {
  status: string
  dataset: DatasetMeta
  trained_combos: number
  training_in_progress: boolean
  model_cache_size: number
}

export interface ForecastQuery {
  area: string
  waste_type: string
  model: ModelKey
  days: number
}
