"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// credits are positive, debits negative — polarity is encoded by POSITION
// (above/below the zero line), which is colorblind-safe; color reinforces.
export type FlowPoint = { label: string; credits: number; debits: number };

const tickStyle = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export function FlowsChart({
  data,
  currency,
}: {
  data: FlowPoint[];
  currency: string;
}) {
  const compact = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const full = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={tickStyle}
          minTickGap={24}
        />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          tick={tickStyle}
          tickFormatter={(v: number) => compact.format(Math.abs(v))}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--popover-foreground)",
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
          formatter={(value, name) => [
            full.format(Math.abs(Number(value))),
            name,
          ]}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 13, color: "var(--muted-foreground)" }}
        />
        <Bar
          dataKey="credits"
          name="Credits"
          fill="var(--credit)"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="debits"
          name="Debits"
          fill="var(--debit)"
          radius={[0, 0, 4, 4]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
