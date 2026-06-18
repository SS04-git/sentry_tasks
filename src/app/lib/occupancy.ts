const API_BASE = "http://backend:8000/api/v1/occupancy";

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

async function fetchOccupancy<T>(endpoint: string): Promise<T> {
  const response = await fetch(
    `${API_BASE}${endpoint}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Occupancy API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export async function getTrend(): Promise<OccupancyTrend[]> {
  return fetchOccupancy<OccupancyTrend[]>("/trend");
}

export async function getForecast(): Promise<ForecastPoint[]> {
  return fetchOccupancy<ForecastPoint[]>("/forecast");
}

export async function getKPI(): Promise<OccupancyKPI> {
  return fetchOccupancy<OccupancyKPI>("/kpi");
}