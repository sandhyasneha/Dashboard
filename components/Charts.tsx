"use client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

const ink = "#1B2431", sign = "#0E6B41", amber = "#C98A00", muted = "#9AA3AE", line = "#D9DDD6";
const tip = { contentStyle: { border: `1px solid ${line}`, borderRadius: 6, fontSize: 13 }, labelStyle: { fontWeight: 600 } };

export function MonthlyBars({ data, current, previous, dataKey, format }: { data: any[]; current: string; previous?: string; dataKey: "filed" | "revenue" | "vehicles"; format?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={2}>
        <CartesianGrid vertical={false} stroke={line} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={format} />
        <Tooltip {...tip} formatter={(v: any) => (format ? format(Number(v)) : v)} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        {previous && <Bar dataKey={`prev_${dataKey}`} name={previous} fill={muted} radius={[3, 3, 0, 0]} />}
        <Bar dataKey={dataKey} name={current} fill={sign} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GrowthLine({ data }: { data: { month: string; registered: number; cumulative: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid vertical={false} stroke={line} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis yAxisId="l" tickLine={false} axisLine={false} fontSize={12} width={40} />
        <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} fontSize={12} width={48} />
        <Tooltip {...tip} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="l" type="monotone" dataKey="registered" name="New registrations" stroke={sign} strokeWidth={2} dot={false} />
        <Line yAxisId="r" type="monotone" dataKey="cumulative" name="Total users" stroke={amber} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: { status: string; n: number }[] }) {
  const colors: Record<string, string> = { Completed: sign, "Schedule 1 Ready": "#2E8B5E", Submitted: amber, Paid: "#E0B14D", Draft: muted, Rejected: "#B3261E" };
  const total = data.reduce((a, d) => a + d.n, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="n" nameKey="status" innerRadius={70} outerRadius={100} paddingAngle={2} stroke="none">
            {data.map((d) => <Cell key={d.status} fill={colors[d.status] ?? ink} />)}
          </Pie>
          <Tooltip {...tip} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute left-1/2 top-[104px] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
        <div className="text-2xl font-bold">{total.toLocaleString()}</div><div className="text-xs text-muted">returns</div>
      </div>
    </div>
  );
}
