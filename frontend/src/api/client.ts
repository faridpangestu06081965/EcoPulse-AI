import axios from 'axios'
import type {
  FiltersResponse,
  ForecastQuery,
  ForecastResponse,
  HealthResponse,
  UploadResponse,
} from '../types'

// Requests are proxied to the FastAPI backend via Vite (see vite.config.ts).
const api = axios.create({
  baseURL: '/api',
  timeout: 180_000, // model retraining / first LSTM load can be slow
  headers: { 'Content-Type': 'application/json' },
})

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health')
  return data
}

export async function getFilters(): Promise<FiltersResponse> {
  const { data } = await api.get<FiltersResponse>('/filters')
  return data
}

export async function getForecast(query: ForecastQuery): Promise<ForecastResponse> {
  const { data } = await api.get<ForecastResponse>('/forecast', { params: query })
  return data
}

export async function uploadDataset(
  file: File,
  retrain: boolean,
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<UploadResponse>('/upload', form, {
    params: { retrain },
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    },
  })
  return data
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
    if (error.code === 'ECONNABORTED') return 'Request timed out. The model may still be training.'
    if (!error.response) return 'Cannot reach the EcoPulse API. Is the backend running on port 8000?'
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

export default api
