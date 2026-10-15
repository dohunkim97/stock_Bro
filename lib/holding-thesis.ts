// "왜 이 종목을 들고 있는지"와 "투자 원칙" — 둥지 종목 진단(lib/holding-
// assessment.ts)이 "지금 신호"는 계산하지만 "애초에 왜 샀는지"는 모른다.
// 이 둘을 같이 봐야 "보유 이유가 아직 유효한지"(module ③) 같은 질문에
// 답할 수 있어서 분리된 작은 저장소로 둔다.

import { prisma } from "@/lib/prisma";

export type HoldingThesisData = { code: string; name: string; reason: string; invalidation: string | null; updatedAt: Date };

export async function getThesis(userId: string, code: string): Promise<HoldingThesisData | null> {
  return prisma.holdingThesis.findUnique({ where: { userId_code: { userId, code } } });
}

export async function getAllTheses(userId: string): Promise<HoldingThesisData[]> {
  return prisma.holdingThesis.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
}

export async function upsertThesis(
  userId: string,
  input: { code: string; name: string; reason: string; invalidation?: string | null }
): Promise<HoldingThesisData> {
  return prisma.holdingThesis.upsert({
    where: { userId_code: { userId, code: input.code } },
    create: { userId, code: input.code, name: input.name, reason: input.reason, invalidation: input.invalidation ?? null },
    update: { name: input.name, reason: input.reason, invalidation: input.invalidation ?? null },
  });
}
