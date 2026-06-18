"use client";

import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface ForecastPoint {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface Props {
  data: ForecastPoint[];
}

export default function ForecastChart({ data }: Props) {
  // transform for proper confidence band
  const transformed = data.map((d) => ({
    ...d,
    band: d.yhat_upper - d.yhat_lower,
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={transformed}>
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="ds" />
        <YAxis />

        <Tooltip />

        {/* Confidence Interval Band */}
        <Area
          type="monotone"
          dataKey="yhat_upper"
          stroke="none"
          fill="#06b6d4"
          fillOpacity={0.08}
        />

        <Area
          type="monotone"
          dataKey="yhat_lower"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
        />

        {/* Optional cleaner CI method (recommended alternative below) */}
        <Line
          type="monotone"
          dataKey="yhat"
          stroke="#00404b"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}