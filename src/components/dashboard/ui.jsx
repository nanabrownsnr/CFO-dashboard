import React from "react";

const STATUS = {
  green: {
    dot: "bg-green shadow-[0_0_0_1px_rgba(0,201,141,0.16)]",
    bg: "bg-[rgba(0,201,141,0.08)]",
  },
  amber: {
    dot: "bg-amber shadow-[0_0_0_1px_rgba(245,166,35,0.16)]",
    bg: "bg-[rgba(245,166,35,0.08)]",
  },
  red: {
    dot: "bg-red shadow-[0_0_0_1px_rgba(239,68,68,0.16)]",
    bg: "bg-[rgba(239,68,68,0.08)]",
  },
  blue: {
    dot: "bg-blue shadow-[0_0_0_1px_rgba(108,92,231,0.16)]",
    bg: "bg-[rgba(108,92,231,0.08)]",
  },
  gray: {
    dot: "bg-gray",
    bg: "bg-panel2",
  },
};

const cx = (...classes) => classes.filter(Boolean).join(" ");

export function statusClasses(status = "gray") {
  return STATUS[status] ?? STATUS.gray;
}

export function Dot({ s = "gray", className }) {
  return <span className={cx("inline-block h-2 w-2 rounded-full", statusClasses(s).dot, className)} />;
}

export function Panel({ title, icon: Icon, right, span, children, className }) {
  return (
    <section
      className={cx(className)}
      style={{
        gridColumn: span ? `span ${span} / span ${span}` : undefined,
        overflow: "hidden",
        border: "1px solid #eaeaf4",
        background: "#ffffff",
        borderRadius: 14,
        boxShadow: "2px 0 40px rgba(0,0,0,0.07)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #eaeaf4", padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={13} color="#6a6a88" />}
          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#6a6a88" }}>{title}</span>
        </div>
        {right}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  );
}

export function KPI({ label, value, unit, status = "gray", sub }) {
  const color = status === "green" ? "#00c98d" : status === "amber" ? "#f5a623" : status === "red" ? "#ef4444" : status === "blue" ? "#6c5ce7" : "#eaeaf4";
  return (
    <div style={{ border: "1px solid #eaeaf4", borderLeft: `3px solid ${color}`, borderRadius: 14, background: "#fff", padding: "16px 18px", minHeight: 108, boxShadow: "2px 0 40px rgba(0,0,0,0.07)" }}>
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Dot s={status} />
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6a6a88" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 24, fontWeight: 800, lineHeight: 1, color: "#0f0f1e" }}>{value}</span>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#8a8aa8" }}>{unit}</span>
      </div>
      {sub && <div style={{ marginTop: 8, fontFamily: "DM Sans, sans-serif", fontSize: 10, color: "#8a8aa8" }}>{sub}</div>}
    </div>
  );
}

export function TabHeader({ tab, answers, priorities = [], phases = [] }) {
  const chips = priorities.filter((p) => p.tab === tab);
  return (
    <div style={{ borderBottom: "1px solid #eaeaf4", padding: "16px 20px 14px", background: "#ffffff", borderRadius: 14, boxShadow: "2px 0 40px rgba(0,0,0,0.07)" }}>
      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#6a6a88" }}>
        <span style={{ marginRight: 8, fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#8a8aa8" }}>This view answers</span>
        <span style={{ color: "#0f0f1e" }}>{answers}</span>
      </div>
      {chips.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chips.map((p) => {
            const phase = phases[p.phase];
            return (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, border: "1px solid #eaeaf4", background: "#fafafe", padding: "6px 12px", fontFamily: "DM Sans, sans-serif", fontSize: 10, color: "#6a6a88" }}>
                <Dot s={p.status} />
                {p.name}
                {phase && <span style={{ color: "#8a8aa8" }}>· {phase.short}</span>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChartTip({ active, payload, label, suffix }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 12, border: "1px solid #eaeaf4", background: "#ffffff", padding: "10px 12px", fontFamily: "DM Sans, sans-serif", fontSize: 11, boxShadow: "2px 0 40px rgba(0,0,0,0.07)" }}>
      <div style={{ marginBottom: 6, color: "#8a8aa8" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {p.value}
          {suffix || ""}
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({ title, eyebrow, description, right }) {
  return (
    <div style={{ marginBottom: 20, display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 12 }}>
      <div>
        {eyebrow && <div style={{ marginBottom: 4, fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.16em", color: "#8a8aa8" }}>{eyebrow}</div>}
        <div style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.04em", color: "#0f0f1e" }}>{title}</div>
        {description && <div style={{ marginTop: 6, maxWidth: 900, fontFamily: "DM Sans, sans-serif", fontSize: 13, lineHeight: 1.6, color: "#6a6a88" }}>{description}</div>}
      </div>
      {right}
    </div>
  );
}

export function StatusChip({ status = "gray", children }) {
  const fill = statusClasses(status);
  const textColor = status === "gray" ? "#8a8aa8" : status === "green" ? "#00c98d" : status === "amber" ? "#f5a623" : status === "red" ? "#ef4444" : "#6c5ce7";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, border: "1px solid #eaeaf4", background: status === "gray" ? "#fafafe" : textColor + "14", padding: "6px 12px", fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: textColor }}>
      <span className={cx("h-2 w-2 rounded-full", fill.dot)} />
      {children}
    </span>
  );
}

export function MetricStrip({ children }) {
  return <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>{children}</div>;
}

export function DataTable({ columns = [], children, className }) {
  return (
    <div className={className} style={{ overflow: "hidden", border: "1px solid #eaeaf4", borderRadius: 14, background: "#fff", boxShadow: "2px 0 40px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "grid", gap: 16, borderBottom: "1px solid #eaeaf4", padding: "14px 18px", gridTemplateColumns: columns.map((column) => column.width ?? "1fr").join(" "), fontFamily: "DM Sans, sans-serif", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#8a8aa8" }}>
        {columns.map((col, index) => <span key={index}>{col.label}</span>)}
      </div>
      <div style={{ display: "grid", rowGap: 0 }}>{children}</div>
    </div>
  );
}
