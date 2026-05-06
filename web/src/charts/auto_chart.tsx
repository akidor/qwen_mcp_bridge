/** 도구 결과 텍스트(JSON)을 차트 spec으로 변환 + recharts 렌더 컴포넌트. */

import {
  Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";

const PRIMARY = "var(--accent)";
const PALETTE = ["#7c3aed", "#22c55e", "#0ea5e9", "#f59e0b", "#ef4444", "#a78bfa", "#14b8a6", "#f43f5e"];

export type ChartSpec =
  | { kind: "bar"; data: any[]; xKey: string; yKey: string; title: string }
  | { kind: "stacked-bar"; data: any[]; xKey: string; series: { key: string; color: string }[]; title: string }
  | { kind: "paired-bar"; data: { name: string; value: number }[]; title: string }
  | { kind: "pie"; data: { name: string; value: number }[]; title: string }
  | { kind: "line"; data: any[]; xKey: string; yKey: string; title: string };

/** 도구 결과 텍스트(JSON) → ChartSpec 또는 null. unwrap envelope 적용. */
export function getChartSpec(toolName: string, resultText: string): ChartSpec | null {
  if (!resultText) return null;
  let raw: any;
  try {
    raw = JSON.parse(resultText);
  } catch {
    return null;
  }
  const parsed: any = raw && raw.ok === true && raw.result ? raw.result : raw;

  // analyze.area_distribution / incorporation_distribution — bar (histogram)
  if (toolName === "analyze__area_distribution" || toolName === "analyze__incorporation_distribution") {
    const buckets = parsed?.buckets;
    if (buckets && typeof buckets === "object") {
      const data = Object.entries(buckets).map(([bucket, count]) => ({
        bucket, count: Number(count) || 0,
      }));
      if (data.length === 0) return null;
      return {
        kind: "bar",
        data,
        xKey: "bucket",
        yKey: "count",
        title: toolName.includes("area") ? "면적 분포" : "편입률 분포",
      };
    }
  }

  // analyze.land_use_summary — pie (jimok_distribution)
  if (toolName === "analyze__land_use_summary") {
    const dist = parsed?.jimok_distribution;
    if (dist && typeof dist === "object") {
      const data = Object.entries(dist)
        .map(([name, value]) => ({ name, value: Number(value) || 0 }))
        .filter((d) => d.value > 0);
      if (data.length === 0) return null;
      return { kind: "pie", data, title: "지목 분포 (m²)" };
    }
  }

  // analyze.population_summary — line (시간 x 값)
  if (toolName === "analyze__population_summary") {
    const arr = parsed?.data ?? parsed?.population ?? null;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      const xKey = "base_year" in first ? "base_year" : "year" in first ? "year" : "label";
      const yKey = "value" in first ? "value" : "population" in first ? "population" : "count";
      return { kind: "line", data: arr, xKey, yKey, title: "인구 변화" };
    }
  }

  // inspect.get_land_use — stacked bar (zones별 ok/no/etc)
  if (toolName === "inspect__get_land_use") {
    const zones = parsed?.zones;
    if (zones && typeof zones === "object") {
      const data = Object.entries(zones).map(([zone, info]: [string, any]) => ({
        zone,
        ok: Number(info?.ok) || 0,
        no: Number(info?.no) || 0,
        etc: Number(info?.etc) || 0,
      }));
      if (data.length === 0) return null;
      return {
        kind: "stacked-bar",
        data,
        xKey: "zone",
        series: [
          { key: "ok", color: "#22c55e" },
          { key: "no", color: "#ef4444" },
          { key: "etc", color: "#f59e0b" },
        ],
        title: "용도지역별 행위 (가능/금지/허가)",
      };
    }
  }

  // estimate.cost_detail — bar (breakdown 항목별 비용 천원)
  if (toolName === "estimate__cost_detail") {
    const bd = parsed?.breakdown;
    if (bd && typeof bd === "object") {
      const data = Object.entries(bd)
        .map(([key, value]) => ({ item: key, cost: Number(value) || 0 }))
        .filter((d) => d.cost > 0);
      if (data.length === 0) return null;
      return { kind: "bar", data, xKey: "item", yKey: "cost", title: "공사비 항목 (천원)" };
    }
  }

  // estimate.parking_estimate — paired bar (법정 vs 추정)
  if (toolName === "estimate__parking_estimate") {
    const required = Number(parsed?.required_count ?? parsed?.legal_count ?? 0) || 0;
    const provided = Number(parsed?.provided_count ?? parsed?.estimate_count ?? 0) || 0;
    if (required + provided > 0) {
      return {
        kind: "paired-bar",
        data: [
          { name: "법정", value: required },
          { name: "추정", value: provided },
        ],
        title: "주차 대수",
      };
    }
  }

  // simulate.shadow_analysis — line (time x shadow_area)
  if (toolName === "simulate__shadow_analysis") {
    const shadows = parsed?.shadows;
    if (Array.isArray(shadows) && shadows.length > 0) {
      const data = shadows.map((s: any) => ({
        time: s?.time ?? "",
        area: Number(s?.shadow_area) || 0,
      })).filter((d) => d.time);
      if (data.length === 0) return null;
      return { kind: "line", data, xKey: "time", yKey: "area", title: "시간별 그림자 면적 (m²)" };
    }
  }

  return null;
}

interface ChartProps {
  spec: ChartSpec;
}

/** mini chart — 200×120 압축 표시. 라벨·legend 최소화. */
export function MiniChart({ spec }: ChartProps) {
  return (
    <div className="chart-mini">
      <div className="chart-mini-title">{spec.title}</div>
      <div className="chart-mini-body">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, true)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** full chart — 모달용. 모든 라벨·legend·tooltip 활성. */
export function FullChart({ spec }: ChartProps) {
  return (
    <div className="chart-full">
      <h3 className="chart-full-title">{spec.title}</h3>
      <div className="chart-full-body">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, false)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderChart(spec: ChartSpec, mini: boolean) {
  const tickStyle = { fontSize: mini ? 9 : 11, fill: "var(--fg-muted)" };
  switch (spec.kind) {
    case "bar":
      return (
        <BarChart data={spec.data} margin={{ top: 4, right: 4, left: mini ? 0 : 20, bottom: mini ? 0 : 20 }}>
          <XAxis dataKey={spec.xKey} tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} width={mini ? 24 : 50} />
          {!mini && <Tooltip wrapperStyle={{ fontSize: 12 }} />}
          <Bar dataKey={spec.yKey} fill={PRIMARY} radius={[3, 3, 0, 0]} />
        </BarChart>
      );
    case "stacked-bar":
      return (
        <BarChart data={spec.data} margin={{ top: 4, right: 4, left: mini ? 0 : 20, bottom: mini ? 0 : 20 }}>
          <XAxis dataKey={spec.xKey} tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} width={mini ? 24 : 50} />
          {!mini && <Tooltip wrapperStyle={{ fontSize: 12 }} />}
          {!mini && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {spec.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      );
    case "paired-bar":
      return (
        <BarChart data={spec.data} margin={{ top: 4, right: 4, left: mini ? 0 : 20, bottom: mini ? 0 : 20 }}>
          <XAxis dataKey="name" tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} width={mini ? 24 : 50} />
          {!mini && <Tooltip wrapperStyle={{ fontSize: 12 }} />}
          <Bar dataKey="value" fill={PRIMARY} radius={[3, 3, 0, 0]} />
        </BarChart>
      );
    case "pie":
      return (
        <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          {!mini && <Tooltip wrapperStyle={{ fontSize: 12 }} />}
          {!mini && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Pie
            data={spec.data}
            dataKey="value"
            nameKey="name"
            innerRadius={mini ? 18 : 50}
            outerRadius={mini ? 40 : 110}
            paddingAngle={2}
            stroke="var(--bg)"
          >
            {spec.data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      );
    case "line":
      return (
        <LineChart data={spec.data} margin={{ top: 4, right: 4, left: mini ? 0 : 20, bottom: mini ? 0 : 20 }}>
          <XAxis dataKey={spec.xKey} tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={{ stroke: "var(--border)" }} width={mini ? 24 : 50} />
          {!mini && <Tooltip wrapperStyle={{ fontSize: 12 }} />}
          <Line type="monotone" dataKey={spec.yKey} stroke={PRIMARY} strokeWidth={2} dot={{ r: mini ? 2 : 3 }} />
        </LineChart>
      );
  }
}
