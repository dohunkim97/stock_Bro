"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { useGolgoo } from "./golgoo-context";
import type { SupportResistanceLevel } from "@/lib/technical-signals";

type ChartPeriod = "D" | "W" | "M";
const PERIOD_LABEL: Record<ChartPeriod, string> = { D: "일봉", W: "주봉", M: "월봉" };

type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

type HoverInfo = {
  date: string;
  close: number;
  prevClose: number | null;
  volume: number;
  mas: Record<number, number | undefined>;
};

type HoverState = { info: HoverInfo; x: number; y: number };

type Role = "support" | "resistance";

type PickedLevel = { level: SupportResistanceLevel; role: Role; isKey: boolean; labelIndex: number; color: string };

// 선 위에는 숫자만 든 작은 동그라미(어느 번호 지지/저항선인지)만 찍는다 —
// 텍스트를 선 위에 바로 쓰면 캔들이랑 겹쳐서 안 보인다는 피드백으로 분리:
// 전체 설명 문장은 LevelSummary로 따로(캔버스 밖, 헤더 아래 한 줄) 보여준다.
type LevelLabel = { id: string; y: number; index: number; color: string };
type LevelSummary = { id: string; text: string; color: string };

type TouchPoint = { id: string; x: number; y: number; index: number; color: string };

type MaConfig = { period: number; color: string };

const MA_COLOR_PALETTE = ["#f59e0b", "#22c55e", "#9ca3af", "#a78bfa", "#f472b6", "#22d3ee", "#fb7185", "#84cc16"];
const DEFAULT_MA_PERIODS = [5, 60, 200];
const MA_STORAGE_KEY = "golgoo-chart-ma-periods";

function defaultMaList(): MaConfig[] {
  return DEFAULT_MA_PERIODS.map((period, i) => ({ period, color: MA_COLOR_PALETTE[i % MA_COLOR_PALETTE.length] }));
}

// 500%(5배) 이상 전일 대비 거래량 급증 — lib/technical-signals.ts의 "거래량
// 폭증" 시그널과 같은 기준. 그쪽은 "오늘"만 판단하지만, 여기선 지지/저항
// 터치 지점처럼 화면에 보이는 기간 전체에서 몇 번이나 있었는지 다 표시한다.
function findVolumeSpikes(candles: Candle[]): string[] {
  const dates: string[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].volume;
    if (prev > 0 && candles[i].volume / prev >= 5) dates.push(candles[i].date);
  }
  return dates;
}

// 국내 주가 표기 관례("71,200") — lightweight-charts 기본 포맷은 콤마를 안
// 찍어줘서 커스텀 포매터로 교체한다. 캔들/이동평균선 시리즈 전부 같은
// 오른쪽 가격축을 공유하니 포맷도 통일해야 눈금이 어긋나 보이지 않는다.
function priceFormatter(price: number): string {
  return Math.round(price).toLocaleString();
}

// lightweight-charts' crosshair callback hands back Time in whatever shape
// the series was given — for whole-day (non-intraday) series like ours that
// can be the original "yyyy-mm-dd" string OR an internal {year,month,day}
// BusinessDay object depending on version/config, so normalize both back to
// the same string format used as the key everywhere else in this file.
function timeToDateStr(t: unknown): string | null {
  if (typeof t === "string") return t;
  if (t && typeof t === "object" && "year" in t && "month" in t && "day" in t) {
    const { year, month, day } = t as { year: number; month: number; day: number };
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

// 네이버증권 HTS 스타일 — 연 경계는 "YYYY/MM", 그 외 월 경계는 "MM", 날짜 단위는
// "DD"만 짧게 표시. 항상 전체 "YYYY-MM-DD"를 찍던 이전 방식보다 훨씬 덜 빽빽함.
function naverTickFormatter(time: unknown, tickMarkType: TickMarkType): string | null {
  const d = timeToDateStr(time);
  if (!d) return null;
  const [y, m, day] = d.split("-");
  switch (tickMarkType) {
    case TickMarkType.Year:
      return `${y}/${m}`;
    case TickMarkType.Month:
      return m;
    case TickMarkType.DayOfMonth:
      return day;
    default:
      return d;
  }
}

function computeSMA(candles: Candle[], period: number): { time: string; value: number }[] {
  if (candles.length < period) return [];
  const points: { time: string; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) points.push({ time: candles[i].date, value: sum / period });
  }
  return points;
}

// 지지/저항은 "지금 가격 대비 어디에 있는지"가 핵심이라, 과거에 아무리 많이
// 부딪힌 레벨이라도 지금 가격과 동떨어져 있으면 당장의 매수/매도 판단에는
// 안 쓸모가 없다 — 현재가에 가장 가까운 지지선 1개 + 저항선 1개를 우선
// 고르고, 그다음으로 터치가 많아 신뢰도 높은 레벨 하나를 더 얹는다(최대 3개).
// 역할(지지/저항)도 레벨 자체의 과거 타입이 아니라 "지금 가격보다 위냐
// 아래냐"로 다시 정한다 — 저항이 뚫리면 지지가 되고 그 반대도 마찬가지라는
// 실제 지지/저항 개념과 일치시키기 위함. labelIndex는 지지/저항 각각
// 독립적으로 매기는 번호("1번 저항선", "2번 저항선", "1번 지지선"…) — 가격이
// 높은 쪽이 1번.
function pickRelevantLevels(levels: SupportResistanceLevel[], currentPrice: number | null): PickedLevel[] {
  if (levels.length === 0) return [];

  const withRole: { level: SupportResistanceLevel; role: Role }[] = levels.map((level) => ({
    level,
    role:
      currentPrice === null
        ? level.type === "support"
          ? "support"
          : "resistance"
        : level.price > currentPrice
          ? "resistance"
          : "support",
  }));

  const supports = withRole.filter((x) => x.role === "support").sort((a, b) => b.level.price - a.level.price);
  const resistances = withRole.filter((x) => x.role === "resistance").sort((a, b) => a.level.price - b.level.price);

  const picked: { level: SupportResistanceLevel; role: Role }[] = [];
  if (supports[0]) picked.push(supports[0]);
  if (resistances[0]) picked.push(resistances[0]);

  const secondCandidates = [supports[1], resistances[1]].filter(
    (x): x is { level: SupportResistanceLevel; role: Role } => !!x
  );
  secondCandidates.sort((a, b) => b.level.touches - a.level.touches);
  if (secondCandidates[0]) picked.push(secondCandidates[0]);

  if (picked.length === 0) return [];
  let keyIdx = 0;
  for (let i = 1; i < picked.length; i++) {
    if (picked[i].level.touches > picked[keyIdx].level.touches) keyIdx = i;
  }

  const withIndex: PickedLevel[] = picked.map((p, i) => ({ ...p, isKey: i === keyIdx, labelIndex: 0, color: "" }));
  for (const role of ["support", "resistance"] as const) {
    const group = withIndex.filter((p) => p.role === role).sort((a, b) => b.level.price - a.level.price);
    group.forEach((p, i) => {
      p.labelIndex = i + 1;
    });
  }
  return withIndex;
}

function roleLabel(role: Role): string {
  return role === "support" ? "지지선" : "저항선";
}

// "많이 지지 받을수록 강한 거고, 저항도 많이 부딪히고 못 뚫으면 강력한
// 저항"이라는 규칙을 그대로 문구로 옮긴다.
function strengthLabel(role: Role, touches: number): string {
  const word = role === "support" ? "지지" : "저항";
  if (touches >= 3) return `강력${word}`;
  if (touches === 2) return `${word} 확인`;
  return `약한 ${word}`;
}

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  overflow: "hidden",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 12.5,
    fontWeight: 700,
    padding: "6px 13px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#0a0d13" : "var(--dim)",
  };
}

// Canvas rendering can't resolve CSS var() itself, so pull the current
// theme's actual colors at chart-creation time — keeps 상승=빨강/하락=파랑
// (this app's convention, see lib/format.ts's chgColorVar) consistent with
// whichever theme (light/dark) happens to be active, without hardcoding
// either palette here.
function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const CHART_HEIGHT = 360;
const VOLUME_PANE_HEIGHT = 90;

// A candlestick+volume chart is a canvas-driven widget with imperative
// setup/teardown (lightweight-charts owns its own render loop) — doesn't
// fit the server-component data flow the rest of the stock page uses, so
// this fetches its own data client-side instead.
export function PriceChart({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const latestDateRef = useRef<string | null>(null);
  const latestCloseRef = useRef<number | null>(null);
  const pickedLevelsRef = useRef<PickedLevel[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [period, setPeriod] = useState<ChartPeriod>("D");
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [chartTick, setChartTick] = useState(0);
  const [levelLabels, setLevelLabels] = useState<LevelLabel[]>([]);
  const [levelSummaries, setLevelSummaries] = useState<LevelSummary[]>([]);
  const [touchPoints, setTouchPoints] = useState<TouchPoint[]>([]);
  const [dividerY, setDividerY] = useState<number | null>(null);
  const recomputeOverlayRef = useRef<() => void>(() => {});

  // 개인 이동평균선 설정 — 기본은 5/60/200일이고, 사용자가 추가/삭제하면
  // 브라우저에 저장해서 다음에 봐도 유지된다(계정/서버 저장 아님, 이 기기
  // 이 브라우저 한정).
  const [maList, setMaList] = useState<MaConfig[]>(defaultMaList);
  const [maEditing, setMaEditing] = useState(false);
  const [maInput, setMaInput] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MA_STORAGE_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved)) return;
      const periods = saved.filter((p): p is number => typeof p === "number" && p > 0 && p <= 999);
      if (periods.length === 0) return;
      setMaList(periods.map((period, i) => ({ period, color: MA_COLOR_PALETTE[i % MA_COLOR_PALETTE.length] })));
    } catch {
      // localStorage unavailable (private mode 등) — 기본값 그대로 사용
    }
  }, []);

  function persistMaList(list: MaConfig[]) {
    try {
      window.localStorage.setItem(MA_STORAGE_KEY, JSON.stringify(list.map((m) => m.period)));
    } catch {
      // best-effort — 저장 안 되면 이번 방문에서만 적용됨
    }
  }

  function addMaPeriod() {
    const n = Number(maInput);
    if (!Number.isInteger(n) || n <= 0 || n > 999 || maList.some((m) => m.period === n)) {
      setMaInput("");
      setMaEditing(false);
      return;
    }
    const next = [...maList, { period: n, color: MA_COLOR_PALETTE[maList.length % MA_COLOR_PALETTE.length] }].sort(
      (a, b) => a.period - b.period
    );
    setMaList(next);
    persistMaList(next);
    setMaInput("");
    setMaEditing(false);
  }

  function removeMaPeriod(period: number) {
    const next = maList.filter((m) => m.period !== period);
    setMaList(next);
    persistMaList(next);
  }

  // 골구 근거 토글 상태 + 시그널/지지·저항 데이터 — GolgooPanel이 불러오는
  // 대로 여기로 흘러들어와서, 켜져 있으면 아래 overlay effect가 차트 위에
  // 그려준다. 이 페이지에 GolgooProvider가 없으면 useGolgoo가 던지므로,
  // app/stock/page.tsx는 항상 이 컴포넌트를 GolgooProvider 안에 둔다.
  // 골구 근거(candidate-gated)와 골구 차트분석(누구든 가능) 둘 다 같은
  // 오버레이를 그릴 수 있어서, 실제로 열려 있는 쪽 데이터를 그대로 쓴다 —
  // 골구 근거 쪽이 더 풍부한 데이터(전략가이드 등과 같이 계산됨)라 두 개가
  // 동시에 열려 있으면 그쪽을 우선한다.
  const {
    open: golgooOpen,
    signals: golgooSignals,
    levels: golgooLevels,
    chartOpen,
    chartSignals,
    chartLevels,
  } = useGolgoo();
  const overlayOpen = golgooOpen || chartOpen;
  const overlaySignals = golgooOpen ? golgooSignals : chartSignals;
  const overlayLevels = golgooOpen ? golgooLevels : chartLevels;

  // 지지/저항선의 "몇 번 선인지" 동그라미와 터치 지점(빈 동그라미)의 화면
  // 좌표, 그리고 차트/거래량 판 경계선 위치를 다시 계산한다 — 팬/줌/
  // 리사이즈될 때마다 다시 불러야 해서 ref로 최신 버전을 항상 들고 있는다.
  // 전체 설명 문장(LevelSummary)은 좌표가 필요 없어서 여기서 같이 채우고
  // 캔버스 밖(헤더 아래)에 그냥 텍스트로 보여준다. 터치 번호는 과거→최근
  // 순으로(1회, 2회, …) 매기고, 화면이 붐비지 않게 레벨당 최근 6개까지만
  // 그린다(번호 자체는 실제 누적 횟수를 유지 — 6개 넘게 터치된 레벨이면
  // "3,4,5회…"로 이어짐).
  function recomputeOverlay() {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const picked = pickedLevelsRef.current;

    const panes = chart?.panes();
    setDividerY(panes && panes[0] ? panes[0].getHeight() : null);

    if (!chart || !series || !overlayOpen || picked.length === 0) {
      setTouchPoints([]);
      setLevelLabels([]);
      setLevelSummaries([]);
      return;
    }

    const points: TouchPoint[] = [];
    const labels: LevelLabel[] = [];
    const summaries: LevelSummary[] = [];

    for (const p of picked) {
      summaries.push({
        id: `${p.role}-${p.level.price}`,
        text: `${p.labelIndex}번 ${roleLabel(p.role)} ${priceFormatter(p.level.price)}원 · ${p.level.touches}회 터치 · ${strengthLabel(p.role, p.level.touches)}`,
        color: p.color,
      });

      const y = series.priceToCoordinate(p.level.price);
      if (y !== null) {
        labels.push({ id: `${p.role}-${p.level.price}`, y: y as number, index: p.labelIndex, color: p.color });
      }

      const chronological = [...p.level.touchDates].sort(); // touchDates는 최신순 저장이라 오래된 순으로 뒤집는다.
      const displayed = chronological.slice(-6);
      const startIndex = chronological.length - displayed.length + 1;
      displayed.forEach((date, i) => {
        const x = chart.timeScale().timeToCoordinate(date as Time);
        if (x === null || y === null) return;
        points.push({ id: `${p.level.price}-${date}`, x: x as number, y: y as number, index: startIndex + i, color: p.color });
      });
    }

    setTouchPoints(points);
    setLevelLabels(labels);
    setLevelSummaries(summaries);
  }
  recomputeOverlayRef.current = recomputeOverlay;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEmpty(false);
    setHover(null);

    fetch(`/api/stock/chart?code=${code}&period=${period}`)
      .then((res) => res.json())
      .then((data: { candles?: Candle[] }) => {
        if (cancelled || !containerRef.current) return;
        const candles = data.candles ?? [];
        candlesRef.current = candles;
        if (candles.length === 0) {
          setEmpty(true);
          setLoading(false);
          return;
        }

        // Period changes re-run this effect — tear down the previous
        // instance before building a new one on the same container.
        resizeObserverRef.current?.disconnect();
        chartRef.current?.remove();
        candleSeriesRef.current = null;
        markersApiRef.current = null;
        volumeMarkersApiRef.current = null;
        priceLinesRef.current = [];

        const upColor = cssVar("--up", "#f2434f");
        const downColor = cssVar("--down", "#3b82f6");
        const textColor = cssVar("--dim", "#8a92a3");
        const borderColor = cssVar("--border2", "rgba(255,255,255,0.12)");

        // lightweight-charts v5 doesn't default to the container's actual
        // clientWidth on its own — without an explicit width or autoSize,
        // it creates its canvases at 0 width (confirmed via a real headless
        // render: canvases existed but measured 0px wide). autoSize wires up
        // a ResizeObserver on the container so it fills the same 100%-width,
        // CHART_HEIGHT-tall box the outer div already reserves — that total
        // stays fixed; only the split between the price/volume panes below
        // is user-resizable (layout.panes.enableResize, on by default).
        const chart = createChart(containerRef.current, {
          layout: {
            background: { color: "transparent" },
            textColor,
            // 라이브러리 자체 구분선은 두께 옵션이 없어서(색만 조절 가능) 진한
            // 색으로 눈에 띄게 하고, 실제 "두꺼운 선"은 아래 dividerY 오버레이
            // div로 그 위에 따로 그린다.
            panes: { enableResize: true, separatorColor: cssVar("--faint", "#545b6b"), separatorHoverColor: cssVar("--accent", "#e0aa3e") },
          },
          grid: { vertLines: { color: borderColor }, horzLines: { color: borderColor } },
          timeScale: {
            borderColor,
            timeVisible: false,
            tickMarkFormatter: naverTickFormatter,
            // Without these, zooming (which scales around the cursor, not
            // the data's own edges) can push the visible range past the
            // first/last candle, leaving a blank gap on one side instead of
            // the plotted candles always spanning the full width.
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          rightPriceScale: { borderColor },
          autoSize: true,
          // Wheel only zooms (never scrolls, so it can't double as pan);
          // left-click-drag pans. fixLeftEdge/fixRightEdge above keep both
          // from ever pulling the chart's edges away from the actual data.
          handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
          handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor,
          downColor,
          borderUpColor: upColor,
          borderDownColor: downColor,
          wickUpColor: upColor,
          wickDownColor: downColor,
          // 국내 주가는 항상 원 단위 정수 — 네이버증권처럼 "71,200"처럼 콤마 포함.
          priceFormat: { type: "custom", formatter: priceFormatter, minMove: 1 },
        });
        candleSeries.setData(
          candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        candleSeriesRef.current = candleSeries;
        markersApiRef.current = createSeriesMarkers(candleSeries, []);
        priceLinesRef.current = [];
        latestDateRef.current = candles[candles.length - 1]?.date ?? null;
        latestCloseRef.current = candles[candles.length - 1]?.close ?? null;

        // Keyed by date so the crosshair handler below can look up each
        // MA's value at whatever bar the cursor is over — a line series only
        // has data from its own window onward (e.g. no 120일선 value for the
        // first 119 bars), so this is left sparse rather than backfilled.
        const maByDate = new Map<string, Record<number, number | undefined>>();
        for (const ma of maList) {
          const points = computeSMA(candles, ma.period);
          if (points.length === 0) continue;
          const maSeries = chart.addSeries(LineSeries, {
            color: ma.color,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: { type: "custom", formatter: priceFormatter, minMove: 1 },
          });
          maSeries.setData(points);
          for (const p of points) {
            maByDate.set(p.time, { ...maByDate.get(p.time), [ma.period]: p.value });
          }
        }

        // 거래량은 캔들과 같은 판(pane)에 눌러 담던 것에서 아예 별도 판으로
        // 분리 — layout.panes.enableResize 덕에 둘 사이 경계를 마우스로
        // 드래그해서 비율을 바꿀 수 있다(전체 차트 높이는 CHART_HEIGHT로 고정).
        const volumeSeries = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: "volume" } },
          1
        );
        volumeSeries.setData(
          candles.map((c) => ({ time: c.date, value: c.volume, color: c.close >= c.open ? upColor : downColor }))
        );
        volumeMarkersApiRef.current = createSeriesMarkers(volumeSeries, []);

        const panes = chart.panes();
        panes[0]?.setHeight(CHART_HEIGHT - VOLUME_PANE_HEIGHT);
        panes[1]?.setHeight(VOLUME_PANE_HEIGHT);

        chart.timeScale().fitContent();

        // 팬/줌으로 시간축이 바뀌면 라벨/터치 지점의 화면 좌표도 다시
        // 계산해야 한다 — ref로 항상 최신 recomputeOverlay를 부른다.
        chart.timeScale().subscribeVisibleLogicalRangeChange(() => recomputeOverlayRef.current());

        // 날짜/종가/거래량/이동평균값을 보여주는 호버 범례 — 커서가 실제로 봉 위에
        //있을 때만 뜨고, 벗어나면 사라짐. 캔들 판(0번)과 거래량 판(1번) 둘 다에서
        // 뜨는데, 거래량 판 위에서는 point.y가 그 판 자체 기준 좌표라 전체 컨테이너
        // 기준으로 보정해줘야 박스가 엉뚱한 위치(캔들 판 쪽)에 뜨지 않는다.
        const byDate = new Map(candles.map((c, i) => [c.date, { c, i }] as const));
        const hoverForDate = (date: string): HoverInfo | null => {
          const found = byDate.get(date);
          if (!found) return null;
          const { c, i } = found;
          return {
            date: c.date,
            close: c.close,
            prevClose: i > 0 ? candles[i - 1].close : null,
            volume: c.volume,
            mas: maByDate.get(c.date) ?? {},
          };
        };

        chart.subscribeCrosshairMove((param) => {
          if (!param.point || !param.time) {
            setHover(null);
            return;
          }
          const date = timeToDateStr(param.time);
          const info = date ? hoverForDate(date) : null;
          if (!info) {
            setHover(null);
            return;
          }
          let y: number = param.point.y;
          if (param.paneIndex === 1 && containerRef.current) {
            const paneEl = chartRef.current?.panes()[1]?.getHTMLElement();
            if (paneEl) y += paneEl.getBoundingClientRect().top - containerRef.current.getBoundingClientRect().top;
          }
          setHover({ info, x: param.point.x, y });
        });

        // autoSize keeps the canvas itself full-width on resize, but doesn't
        // re-fit the visible candle range — without this, a container size
        // change (sidebar height stretch settling, window resize, font
        // reflow) leaves the existing candles at their old width, no longer
        // spanning the new one. Only fires on actual size changes, not on
        // the user's own wheel-zoom/drag (those don't resize the container),
        // so it never fights a manual zoom.
        let rafId: number | null = null;
        const resizeObserver = new ResizeObserver(() => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            chartRef.current?.timeScale().fitContent();
            recomputeOverlayRef.current();
          });
        });
        resizeObserver.observe(containerRef.current);
        // 판 경계(가격/거래량)를 마우스로 드래그해서 높이를 바꿀 때는 컨테이너
        // 전체 크기는 안 바뀌니 위 observe만으론 안 잡힌다 — 라이브러리에
        // 전용 리사이즈 이벤트가 없어서 가격 판 자체의 DOM 엘리먼트도 같이
        // 관찰해 dividerY(두꺼운 구분선 오버레이 위치)를 계속 맞춘다.
        const pricePaneEl = chart.panes()[0]?.getHTMLElement();
        if (pricePaneEl) resizeObserver.observe(pricePaneEl);
        resizeObserverRef.current = resizeObserver;

        setLoading(false);
        setChartTick((v) => v + 1); // lets the overlay effect below (re)draw on a fresh series
        recomputeOverlayRef.current();
      })
      .catch(() => {
        if (!cancelled) {
          setEmpty(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, period, maList]);

  // Unmount cleanup only — separate from the fetch effect above so a period
  // switch doesn't tear down and immediately recreate on every keystroke of
  // the effect dependency change (handled by chartRef.current?.remove() at
  // the top of the fetch effect instead).
  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      markersApiRef.current = null;
      volumeMarkersApiRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // 골구 근거 또는 골구 차트분석 둘 중 하나라도 켜져 있으면(overlayOpen)
  // 지지/저항 레벨은 실선 가격선으로, 오늘 활성화된 시그널은 최근 봉 위에
  // 동그라미 마커로, 전일 대비 거래량 500%+ 급증은 거래량 판에 동그라미로
  // 그린다 — 둘 다 꺼지면 지운다. chartTick은 기간(D/W/M) 전환으로 차트가
  // 통째로 다시 만들어졌을 때도 이 effect가 새 시리즈에 다시 그리도록
  // 하는 트리거.
  useEffect(() => {
    const series = candleSeriesRef.current;
    const markersApi = markersApiRef.current;
    const volumeMarkersApi = volumeMarkersApiRef.current;
    if (!series || !markersApi) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // series/line may already be gone if the chart was torn down mid-flight
      }
    }
    priceLinesRef.current = [];

    if (!overlayOpen) {
      markersApi.setMarkers([]);
      volumeMarkersApi?.setMarkers([]);
      pickedLevelsRef.current = [];
      setLevelLabels([]);
      setLevelSummaries([]);
      setTouchPoints([]);
      return;
    }

    const upColor = cssVar("--up", "#f2434f");
    const downColor = cssVar("--down", "#3b82f6");
    const dimColor = cssVar("--dim", "#8a92a3");
    const accentColor = cssVar("--accent", "#e0aa3e"); // 저항선 = 노랑/골드
    const textColor = cssVar("--text", "#e7eaf0"); // 지지선 = 다크모드 흰색, 라이트모드 검정
    const roleColor = (role: Role) => (role === "resistance" ? accentColor : textColor);

    const picked = (overlayLevels ? pickRelevantLevels(overlayLevels, latestCloseRef.current) : []).map((p) => ({
      ...p,
      color: roleColor(p.role),
    }));
    pickedLevelsRef.current = picked;

    // 라인은 얇게 — 굵으면 캔들을 가려서 오히려 안 보인다는 피드백으로
    // 더 얇게 뺐다. 어느 선인지는 이제 선 위 동그라미 번호로 구분한다.
    for (const p of picked) {
      try {
        const line = series.createPriceLine({
          price: p.level.price,
          color: p.color,
          lineWidth: p.isKey ? 2 : 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
        });
        priceLinesRef.current.push(line);
      } catch {
        // stale series from a just-torn-down chart — next tick redraws
      }
    }

    const markers: SeriesMarker<Time>[] = [];

    // 오늘 기준으로 활성화된 시그널(거래량/이동평균선 등)은 최근 봉 위에
    // 동그라미로 — 위 지지/저항 터치(빈 동그라미, HTML로 따로 그림)와 구분되게 둔다.
    if (overlaySignals && overlaySignals.length > 0 && latestDateRef.current) {
      for (const s of overlaySignals) {
        markers.push({
          time: latestDateRef.current as Time,
          position: s.direction === "bearish" ? "belowBar" : "aboveBar",
          shape: "circle",
          color: s.direction === "bullish" ? upColor : s.direction === "bearish" ? downColor : dimColor,
          text: s.name,
          id: `golgoo-signal-${s.name}`,
        });
      }
    }

    markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
    markersApi.setMarkers(markers);

    // 전일 대비 거래량 500%+ 급증한 날 전부 거래량 판에 동그라미 체크.
    if (volumeMarkersApi) {
      const spikeDates = findVolumeSpikes(candlesRef.current);
      const volMarkers: SeriesMarker<Time>[] = spikeDates.map((date) => ({
        time: date as Time,
        position: "aboveBar",
        shape: "circle",
        color: accentColor,
        text: "거래량 500%+",
        id: `vol-spike-${date}`,
      }));
      volumeMarkersApi.setMarkers(volMarkers);
    }

    recomputeOverlay();
  }, [overlayOpen, overlaySignals, overlayLevels, chartTick]);

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>차트</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {maList.map((ma) => (
              <span
                key={ma.period}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: ma.color,
                  fontWeight: 700,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  padding: "3px 6px 3px 8px",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: ma.color }} />
                {ma.period}
                <button
                  onClick={() => removeMaPeriod(ma.period)}
                  title="이동평균선 삭제"
                  style={{
                    border: "none",
                    background: "none",
                    color: "var(--faint)",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0,
                    lineHeight: 1,
                    marginLeft: 2,
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
            {maEditing ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={999}
                  value={maInput}
                  onChange={(e) => setMaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addMaPeriod();
                    if (e.key === "Escape") {
                      setMaEditing(false);
                      setMaInput("");
                    }
                  }}
                  placeholder="일수"
                  style={{
                    width: 52,
                    fontSize: 11,
                    padding: "4px 6px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--panel2)",
                    color: "var(--text)",
                  }}
                />
                <button
                  onClick={addMaPeriod}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--accent)",
                    color: "#0a0d13",
                    cursor: "pointer",
                  }}
                >
                  확인
                </button>
              </span>
            ) : (
              <button
                onClick={() => setMaEditing(true)}
                title="이동평균선 직접 추가"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 9px",
                  borderRadius: 20,
                  border: "1px dashed var(--border2)",
                  background: "transparent",
                  color: "var(--faint)",
                  cursor: "pointer",
                }}
              >
                + 이평선
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 9, padding: 2 }}>
          {(Object.keys(PERIOD_LABEL) as ChartPeriod[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={tabStyle(p === period)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {!loading && !empty && levelSummaries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 16px",
            padding: "10px 18px",
            borderBottom: "1px solid var(--border)",
            fontFamily: "var(--mono)",
            fontSize: 12,
          }}
        >
          {levelSummaries.map((s) => (
            <span key={s.id} style={{ color: s.color, fontWeight: 700 }}>
              {s.text}
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative", minHeight: CHART_HEIGHT }}>
        <div
          ref={containerRef}
          style={{ width: "100%", height: CHART_HEIGHT, display: loading || empty ? "none" : "block" }}
        />

        {!loading && !empty && dividerY !== null && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: dividerY - 2,
              height: 4,
              background: "var(--faint)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        )}

        {!loading &&
          !empty &&
          levelLabels.map((lb) => (
            <div
              key={lb.id}
              title={`${lb.index}번 선`}
              style={{
                position: "absolute",
                left: 6,
                top: lb.y - 10,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: lb.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 4,
                pointerEvents: "none",
                boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--panel)", fontFamily: "var(--mono)" }}>
                {lb.index}
              </span>
            </div>
          ))}

        {!loading &&
          !empty &&
          touchPoints.map((pt) => (
            <div
              key={pt.id}
              title={`${pt.index}회 터치`}
              style={{
                position: "absolute",
                left: pt.x - 7,
                top: pt.y - 7,
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `2px solid ${pt.color}`,
                background: "var(--panel)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 3,
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: 8, fontWeight: 800, color: pt.color, fontFamily: "var(--mono)" }}>
                {pt.index}
              </span>
            </div>
          ))}

        {hover && !loading && !empty && (() => {
          const BOX_WIDTH = 172;
          const BOX_HEIGHT = 26 * (3 + maList.length) + 20;
          const containerWidth = containerRef.current?.clientWidth ?? 600;
          const containerHeight = containerRef.current?.clientHeight ?? CHART_HEIGHT;
          const flipX = hover.x > containerWidth - BOX_WIDTH - 20;
          const flipY = hover.y > containerHeight - BOX_HEIGHT - 20;
          const info = hover.info;
          return (
            <div
              style={{
                position: "absolute",
                left: flipX ? hover.x - BOX_WIDTH - 14 : hover.x + 14,
                top: flipY ? hover.y - BOX_HEIGHT - 14 : hover.y + 14,
                width: BOX_WIDTH,
                zIndex: 5,
                pointerEvents: "none",
                background: "color-mix(in srgb, var(--panel) 92%, transparent)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
                fontFamily: "var(--mono)",
                fontSize: 12,
                lineHeight: 1.9,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>날짜</span>
                <span style={{ fontWeight: 700 }}>{info.date}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>종가</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: info.prevClose === null || info.close >= info.prevClose ? "var(--up)" : "var(--down)",
                  }}
                >
                  {info.close.toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <span style={{ color: "var(--faint)" }}>거래량</span>
                <span style={{ fontWeight: 700 }}>{info.volume.toLocaleString()}</span>
              </div>
              {maList.map((ma) => {
                const v = info.mas[ma.period];
                return (
                  <div key={ma.period} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: ma.color }}>{ma.period}일선</span>
                    <span style={{ fontWeight: 700, color: v === undefined ? "var(--faint)" : ma.color }}>
                      {v === undefined ? "-" : Math.round(v).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {(loading || empty) && (
          <div
            style={{
              height: CHART_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--faint)",
              fontSize: 13,
            }}
          >
            {loading ? "차트 불러오는 중…" : "차트 데이터를 가져오지 못했어요"}
          </div>
        )}
      </div>
    </section>
  );
}
