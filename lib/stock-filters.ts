// Neither data.go.kr nor KIS's ranking endpoints expose an explicit
// "보통주/우선주" flag, so this leans on the standard Korean naming
// convention for preferred shares: the company name followed by "우",
// optionally a series number before it ("1우", "2우") and/or a class
// letter after it ("우B", "2우B" for 신형우선주). Used when building
// ranking lists (급상승/거래량 상위) — not applied to single-stock lookups,
// since a user should still be able to look up a preferred share directly.
export function isPreferredStock(name: string): boolean {
  return /\d*우(?:[A-Z])?$/.test(name.trim());
}
