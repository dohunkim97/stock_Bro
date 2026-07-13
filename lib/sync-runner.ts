import { fetchKrxDayRanking } from "@/lib/krx-sync";
import { replaceDayEntries } from "@/lib/market-data";
import { todayISO, toYYYYMMDD } from "@/lib/dates";

export async function runMarketSync(dateIso?: string) {
  const date = dateIso ?? todayISO();
  const basDt = toYYYYMMDD(date);
  const { volume, gainer, rawCount } = await fetchKrxDayRanking(basDt);

  if (rawCount === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "해당 날짜에 KRX 데이터가 없어요 (휴장일이거나 아직 집계 전일 수 있어요)",
      date,
    };
  }

  await replaceDayEntries(date, { volume, gainer });
  return {
    ok: true,
    skipped: false,
    date,
    volumeCount: volume.length,
    gainerCount: gainer.length,
  };
}
