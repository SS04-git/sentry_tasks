// app/lib/occupancy.ts
import { fetchWithAuth } from '@/app/lib/api';

export interface OccupancyTrend {
  event_date: string;
  peak_occupancy: number;
  weekly_slope: number | null;
}

export interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface OccupancyKPI {
  peak: number;
  avg: number;
  min: number;
}

export async function getTrend(token: string): Promise<OccupancyTrend[]> {
  return fetchWithAuth('api/v1/occupancy/trend', token);
}

export async function getForecast(token: string): Promise<ForecastPoint[]> {
  return fetchWithAuth('api/v1/occupancy/forecast', token);
}

export async function getKPI(token: string): Promise<OccupancyKPI> {
  return fetchWithAuth('api/v1/occupancy/kpi', token);
}