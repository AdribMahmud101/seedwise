import React from "react";
import { createRoot } from "react-dom/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const h = React.createElement;
const axis = { fontSize: 11, fill: "#657365" };
const grid = { stroke: "#e3e6da" };

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return h("div", { className: "sw-chart-tooltip" }, [
    h("strong", { key: "label" }, label),
    ...payload.map((item) => h("div", { key: item.dataKey, style: { color: item.color } }, `${item.name}: ${item.value}${unit ? ` ${unit}` : ""}`)),
  ]);
}

export function mountBarChart(el, { data, selected }) {
  const root = createRoot(el);
  root.render(h(ResponsiveContainer, { width: "100%", height: "100%" },
    h(BarChart, { data, margin: { top: 20, right: 8, bottom: 0, left: 4 }, accessibilityLayer: true }, [
      h(CartesianGrid, { key: "grid", vertical: false, ...grid }),
      h(XAxis, { key: "x", dataKey: "year", tick: axis, tickLine: false, axisLine: false, interval: 0 }),
      h(YAxis, { key: "y", width: 48, tick: axis, tickLine: false, axisLine: false, tickFormatter: (v) => v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : String(v) }),
      h(Tooltip, { key: "tip", content: (props) => h(ChartTooltip, { ...props, unit: "mm" }), cursor: { fill: "#edf1e9" } }),
      h(Bar, { key: "bar", dataKey: "total", name: "GPM IMERG", maxBarSize: 44, radius: [3, 3, 0, 0] }, [
        ...data.map((row) => h(Cell, { key: row.year, fill: row.year === selected ? "#244f3d" : "#9eafa3" })),
        h(LabelList, { key: "labels", dataKey: "total", position: "top", formatter: (v) => v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : Number(v).toLocaleString(), style: { fontSize: 11, fill: "#34483b" } }),
      ]),
    ]),
  ));
  return () => root.unmount();
}

export function mountLineChart(el, { data, series, unit, max, selected }) {
  const root = createRoot(el);
  root.render(h(ResponsiveContainer, { width: "100%", height: "100%" },
    h(LineChart, { data, margin: { top: 10, right: 10, bottom: 0, left: 0 }, accessibilityLayer: true }, [
      h(CartesianGrid, { key: "grid", vertical: false, ...grid }),
      h(XAxis, { key: "x", dataKey: "month", tick: axis, tickLine: false, axisLine: false, interval: "preserveStartEnd", minTickGap: 8 }),
      h(YAxis, { key: "y", width: 42, domain: max == null ? ["auto", "auto"] : [0, max], tick: axis, tickLine: false, axisLine: false, tickFormatter: (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }) }),
      selected && h(ReferenceLine, { key: "selected", x: selected, stroke: "#adb59f", strokeDasharray: "3 4" }),
      h(Tooltip, { key: "tip", content: (props) => h(ChartTooltip, { ...props, unit }), cursor: { stroke: "#adb59f", strokeDasharray: "3 4" } }),
      ...series.map((s) => h(Line, { key: s.key, type: "monotone", dataKey: s.key, name: s.label, stroke: s.color, strokeWidth: 2.5, strokeDasharray: s.dash ? "5 4" : undefined, dot: { r: 2.5 }, activeDot: { r: 5 }, connectNulls: false })),
    ]),
  ));
  return () => root.unmount();
}
