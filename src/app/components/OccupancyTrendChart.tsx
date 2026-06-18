"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface OccupancyTrend {
  event_date: string;
  peak_occupancy: number;
}

interface Props {
  data: OccupancyTrend[];
}

export default function OccupancyTrendChart({
  data,
}: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="event_date" />

        <YAxis />

        <Tooltip />

        <Line
          type="monotone"
          dataKey="peak_occupancy"
          stroke="#06b6d4"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}