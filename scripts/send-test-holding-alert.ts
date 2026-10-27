// 수동 실행용: npx tsx scripts/send-test-holding-alert.ts [이메일]
// 둥지 텔레그램 알림의 상세 버튼(📊💰📰⚠️📈)이 실제로 되는지 확인하려고, 연결된
// 텔레그램으로 "🧪 테스트 알림"을 한 통 보낸다(lib/portfolio-alerts.ts
// sendTestPortfolioAlert). 실제 알림의 하루 중복 방지 기록은 남기지 않는다.
// 이메일을 안 주면 텔레그램이 연결된 계정이 하나일 때만 그 계정으로 보낸다.

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

// prisma 클라이언트가 env를 읽은 뒤에 만들어지도록 import를 main 안에서 한다
// (정적 import는 위의 config보다 먼저 실행된다).
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { sendTestPortfolioAlert } = await import("../lib/portfolio-alerts");
  const email = process.argv[2];
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null }, ...(email ? { email } : {}) },
    select: { id: true, email: true },
  });
  if (users.length !== 1) {
    console.error(email ? `텔레그램이 연결된 ${email} 계정을 찾지 못했어요` : `텔레그램 연결 계정이 ${users.length}개예요 — 이메일을 지정해줘`);
    process.exit(1);
  }
  const result = await sendTestPortfolioAlert(users[0].id);
  console.log(`전송 ${result.sent ? "성공" : "실패"} — 상세 기록 ${result.records.length}건: ${result.records.map((r) => `${r.name}(${r.id})`).join(", ")}`);
  await prisma.$disconnect();
}

main().then(() => process.exit(0));
