"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CashPoint = { label: string; cash: number };

const tickStyle = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export function CashPositionChart({
  data,
  currency,
}: {
  data: CashPoint[];
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
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v: number) => compact.format(v)}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--popover-foreground)",
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
          formatter={(value) => [full.format(Number(value)), "Cash"]}
        />
        <Area
          type="monotone"
          dataKey="cash"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#cashFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
