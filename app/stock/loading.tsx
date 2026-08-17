// Without this, Next.js has no loading boundary to show while
// app/stock/page.tsx does its live refresh (refreshStockSnapshot can take
// 15-25s) — so clicking a gainer/거래량 상위 row would leave the URL and UI
// completely unchanged for that whole stretch, looking exactly like the
// click did nothing. This renders instantly on navigation so the URL
// updates and the user gets feedback right away, then streams in over it.

import { DuckLoader } from "@/components/ui/duck-loader";

const bar = (width: string | number, height = 14): React.CSSProperties => ({
  width,
  height,
  borderRadius: 6,
  background: "var(--panel2)",
  animation: "blink 1.4s ease-in-out infinite",
});

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
};

export default function StockLoading() {
  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "26px 24px 60px" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={bar(220, 28)} />
          <div style={bar(70, 16)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={bar(90, 22)} />
          <div style={bar(70, 22)} />
          <div style={bar(70, 22)} />
        </div>
      </div>

      <div style={{ ...cardStyle, height: 360, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DuckLoader label="시세를 불러오는 중…" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={bar("60%", 16)} />
          <div style={bar("90%")} />
          <div style={bar("80%")} />
        </div>
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={bar("60%", 16)} />
          <div style={bar("90%")} />
          <div style={bar("80%")} />
        </div>
      </div>
    </main>
  );
}
