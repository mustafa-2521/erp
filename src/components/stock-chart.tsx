'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type StockPoint = { name: string; qty: number };

export default function StockChart({ data }: { data: StockPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -16, right: 4, top: 4 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 8, color: 'rgb(var(--fg))' }} />
        <Bar dataKey="qty" name="Quantity" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
