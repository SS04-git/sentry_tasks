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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function OccupancyTrendChart({ data }: Props) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="event_date"
            tickFormatter={formatDate}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
          tick={{ fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={[0, (max: number) => Math.ceil(max)]}
          label={{
            value: "Occupants",
            angle: -90,
            position: "insideLeft",
            style: { textAnchor: "middle", fontSize: 12, fill: "var(--text-muted)" },
          }}
        />
          <Tooltip
            labelFormatter={(label) => formatDate(label as string)}
            formatter={(value, name) => [value, "Peak occupants"]}
          />
          <Line type="linear" dataKey="peak_occupancy" stroke="#06b6d4" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: "1rem 0 0 0", textAlign: "center", color: "var(--text)" }}>
        Daily Peak Occupancy
      </p>
    </div>
  );
}