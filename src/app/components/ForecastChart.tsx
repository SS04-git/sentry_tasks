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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ForecastChart({ data }: Props) {
  const transformed = data.map((d) => ({
    ...d,
    band: d.yhat_upper - d.yhat_lower,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={transformed} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ds"
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
           formatter={(value, name) => {
           const labels: Record<string, string> = {
           yhat: "Predicted",
           yhat_upper: "Upper bound",
           yhat_lower: "Lower bound",
          };
          return [value, labels[name as string] ?? (name as string)];
          }}/>
          <Area         
 type="monotone"  
  dataKey={(d: any) => [d.yhat_lower, d.yhat_upper]}
  stroke="none"
  fill="#06b6d4"
  fillOpacity={0.08}
/>
<Line type="monotone" dataKey="yhat_lower" stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 3" dot={false} />
<Line type="monotone" dataKey="yhat_upper" stroke="#06b6d4" strokeWidth={1} strokeDasharray="4 3" dot={false} />
          <Line type="linear" dataKey="yhat" stroke="#00404b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ fontSize: "0.95rem", fontWeight: 600, margin: "1rem 0 0 0", textAlign: "center", color: "var(--text)" }}>
        Forecasted Occupancy (Next Period)
      </p>
    </div>
  );
}