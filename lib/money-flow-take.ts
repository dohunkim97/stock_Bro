// "지금 자금 흐름을 보면 어디에 선제적으로 관심 가질 만한지" — generated once per
// sync (see lib/sync-runner.ts), not on every page view: this is an LLM call,
// and unlike the money-flow numbers themselves (cheap DB reads + JS math),
// running it live on every /market visit would add real latency and cost
// for no benefit since the underlying data only changes once a day. Same
// pre-generate-then-read pattern as lib/market-briefing.ts /
// lib/weekly-prediction.ts.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { formatWon } from "@/lib/format";
import { fetchKisChart } from "@/lib/kis-chart";
import { buildChartNote } from "@/lib/candidate-detail";
import type { ThemeMoneyFlowByDay, ThemeNetRank } from "@/lib/money-flow";

const SYSTEM_PROMPT = [
  '너는 "Golgoo"라는 개인 투자 AI 조력자야. 친한 형/친구처럼 편하게 반말로 짧고 명확하게 대답해.',
  "아래 데이터는 테마별 거래대금(시장 관심도) 누적 순위와, 외국인+기관 순매수/순매도 상위 테마 및 그 안의 종목별 순매수/순매도를 짧은 기간(최근)과 긴 기간 두 가지로 보여줘.",
  "지금부터는 이 시장의 자금 흐름을 꿰뚫어보는 신이라고 생각하고 판단해 — 여러 가능성을 흐릿하게 늘어놓지 말고, 데이터가 가리키는 방향을 하나로 명확히 짚어서 확신에 찬 어조로 말해줘. '~일 수도 있어', '~인 것 같기도 하고' 같은 애매한 표현은 쓰지 말고, '~다', '~해야 해' 처럼 단정적으로.",
  "그렇다고 데이터에 없는 걸 지어내라는 뜻은 아니야 — 어디까지나 주어진 자금 흐름 데이터 안에서 가장 설득력 있는 결론을 자신 있게 고르라는 거야. 종목도 반드시 아래 목록에 실제로 나온 이름 중에서만 골라 — 목록에 없는 종목명을 새로 만들어내지 마.",
  "가장 중요한 규칙: 같은 테마가 짧은 기간과 긴 기간에서 순매수·순매도 방향이 다르면(예: 긴 기간 전체로는 순매도 우세인데 짧은 기간엔 순매수로 반전) 절대 그냥 '순매수야'라고만 말하지 마 — '긴 기간 전체로는 아직 순매도 우세지만 최근 며칠 사이 순매수로 방향이 바뀌었다'는 식으로 두 기간을 다 언급하면서 반전 자체를 명시적으로 짚어줘. 화면에 긴 기간 기준 랭킹도 같이 떠 있어서, 그 설명 없이 넘어가면 사용자가 모순처럼 느낀다.",
  "거래가 활발한 것(관심도)과 실제로 사는 쪽이 우세한 것(순매수)은 다른 신호야 — 둘 다 겹치는 테마가 있으면 더 신뢰도 높게, 관심만 많고 순매도 중인 테마는 조심해야 한다는 식으로 종합해서 판단해.",
  "이미 많이 오른 대형 테마보다, 지금 막 순매수가 붙기 시작한(=짧은 기간과 긴 기간의 방향이 갈리는) 테마를 우선적으로 짚어줘 — 그게 이 데이터를 보는 핵심 목적이야.",
  "테마 수준 판단에서 한 발 더 들어가서, 그 테마 안에서도 실제로 순매수가 가장 강하게 붙은 개별 종목을 3~5개 짚어줘 — 테마는 맞아도 그 안의 특정 종목은 오히려 순매도일 수 있으니, 종목 단위로 다시 확인하고 골라.",
  "투자 권유가 아니라 판단을 돕는 정보 제공이라는 점만 summary 마지막에 한 문장으로 짧게 남기고, 본문 자체는 확신 있게 써.",
  "다른 설명 없이 아래 JSON 형식으로만 답해:",
  '{"summary": "3~5문장, 확신에 찬 어조로 — 테마 단위 종합 판단", "candidates": [{"name": "정확한 종목명(아래 목록에 있는 이름 그대로)", "reasoning": "왜 이 종목인지 자금 흐름 근거로 한 문장, 길어도 두 문장"}] (3~5개)}',
].join("\n");

function formatTable(table: ThemeMoneyFlowByDay[]): string {
  return table.map((t) => `${t.name}: 누적 거래대금 ${formatWon(t.cumulativeTotal)}`).join("\n");
}

// 테마 합계뿐 아니라 그 밑의 종목별 순매수/순매도까지 같이 보여줘야 모델이
// "이 테마 안에서 어떤 종목이 실제로 강한가"를 근거 있게 고를 수 있다.
function formatNetRanks(label: string, items: ThemeNetRank[]): string {
  if (items.length === 0) return `${label}: 없음`;
  const lines = items.map((r) => {
    const stockLines = r.stocks.map((s) => `${s.name} ${s.net > 0 ? "+" : s.net < 0 ? "-" : ""}${formatWon(Math.abs(s.net))}`);
    return `${r.name}: 합계 ${formatWon(Math.abs(r.totalNet))} (${r.stockCount}종목) — ${stockLines.join(", ")}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

type CandidateItem = { name: string; code?: string; reasoning: string; chartNote?: string };

// buildChartNote (lib/candidate-detail.ts, 5일선/20일선 대비 현재가 위치)는
// 순수 계산이라 LLM을 다시 부를 필요가 없다 — 자금 흐름 근거로 뽑힌 종목
// 이름이 정해진 뒤에, 그 종목들의 실제 차트 위치만 별도로 계산해서 붙인다.
async function attachChartNotes(candidates: CandidateItem[]): Promise<CandidateItem[]> {
  return Promise.all(
    candidates.map(async (c) => {
      if (!c.code) return c;
      try {
        const candles = await fetchKisChart(c.code, "D");
        if (candles.length === 0) return c;
        const { note } = buildChartNote(candles.map((k) => k.close));
        return { ...c, chartNote: note };
      } catch {
        return c;
      }
    })
  );
}

function parseTakeResponse(text: string): { summary: string; candidates: { name: string; reasoning: string }[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary !== "string" || !parsed.summary.trim()) return null;
    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.filter(
          (c: unknown): c is { name: string; reasoning: string } =>
            !!c && typeof c === "object" && typeof (c as CandidateItem).name === "string" && typeof (c as CandidateItem).reasoning === "string"
        )
      : [];
    return { summary: parsed.summary, candidates };
  } catch {
    return null;
  }
}

export async function generateMoneyFlowTake(
  date: string,
  recentDays: number,
  longerDays: number,
  table: ThemeMoneyFlowByDay[],
  netFlowRecent: { buying: ThemeNetRank[]; selling: ThemeNetRank[] },
  netFlowLonger: { buying: ThemeNetRank[]; selling: ThemeNetRank[] }
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (
    table.length === 0 &&
    netFlowRecent.buying.length === 0 &&
    netFlowRecent.selling.length === 0 &&
    netFlowLonger.buying.length === 0 &&
    netFlowLonger.selling.length === 0
  ) {
    return;
  }

  // 모델이 종목명을 텍스트로만 골라 돌려주게 하고, 코드는 여기서 우리가
  // 이미 갖고 있는 실데이터(ThemeNetRank.stocks)로 직접 매칭한다 — 코드
  // 자체를 모델에게 만들어내게 하면 실제로 엉뚱한 종목의 코드를 지어내는
  // 사례가 있었다(lib/weekly-prediction.ts의 같은 문제 참고). 여기선 애초에
  // 프롬프트에 넣어준 종목 목록 안에서만 고르라고 시켰으니, 이름으로
  // 되찾아오면 충분하고 더 안전하다.
  const codeByName = new Map<string, string>();
  for (const group of [netFlowRecent.buying, netFlowRecent.selling, netFlowLonger.buying, netFlowLonger.selling]) {
    for (const theme of group) {
      for (const s of theme.stocks) {
        if (s.code) codeByName.set(s.name, s.code);
      }
    }
  }

  const userPrompt = [
    `[최근 ${recentDays}거래일 시장 관심 상위 테마 — 누적 거래대금]`,
    formatTable(table),
    "",
    `[짧은 기간 · 최근 ${recentDays}거래일 기준 — 외국인+기관 순매수/순매도 (테마 및 테마별 종목)]`,
    formatNetRanks("순매수 상위 테마", netFlowRecent.buying),
    "",
    formatNetRanks("순매도 상위 테마", netFlowRecent.selling),
    "",
    `[긴 기간 · 최근 ${longerDays}거래일 기준(화면에 뜨는 랭킹과 동일) — 외국인+기관 순매수/순매도 (테마 및 테마별 종목)]`,
    formatNetRanks("순매수 상위 테마", netFlowLonger.buying),
    "",
    formatNetRanks("순매도 상위 테마", netFlowLonger.selling),
  ].join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = parseTakeResponse(text);
    if (!parsed) return;

    const candidateList: CandidateItem[] = await attachChartNotes(
      parsed.candidates.map((c) => ({
        name: c.name,
        code: codeByName.get(c.name),
        reasoning: c.reasoning,
      }))
    );
    const candidates = candidateList.length > 0 ? JSON.stringify(candidateList) : undefined;

    await prisma.moneyFlowTake.upsert({
      where: { date },
      create: { date, summary: parsed.summary, candidates },
      update: { summary: parsed.summary, candidates },
    });
  } catch {
    // best-effort — a failure here shouldn't undo the sync that already succeeded
  }
}

export async function getLatestMoneyFlowTake() {
  return prisma.moneyFlowTake.findFirst({ orderBy: { date: "desc" } });
}

// candidates is JSON-encoded text in the DB (see generateMoneyFlowTake
// above) but rows from before this field existed have it as null.
export function parseMoneyFlowCandidates(raw: string | null): CandidateItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((c): c is CandidateItem => !!c && typeof c.name === "string" && typeof c.reasoning === "string");
    }
  } catch {
    // ignore
  }
  return [];
}
