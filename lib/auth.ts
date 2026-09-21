// 구글 로그인(Auth.js/NextAuth v5) — 세션 전략은 JWT라(DB 세션 테이블
// 없음) NextAuth 자체 Account/Session 스키마를 쓰지 않고, 로그인 성공
// 콜백에서 우리 User 테이블(prisma/schema.prisma)에 email로 upsert만
// 한다. role(admin/user)은 ADMIN_EMAILS 환경변수(쉼표 구분 이메일 목록)와
// 대조해서 그때 정해진다 — 이 목록에 있으면 admin, 없으면 user.
//
// 아직 하는 일: 로그인/로그아웃, 세션에 role 노출. 아직 안 하는 일: 어떤
// 페이지도 로그인 여부로 막지 않음 — "둥지"(개인 자산관리) 데이터를
// 사용자별로 나누는 다음 단계에서 User.id를 PortfolioSettings/
// PortfolioHolding에 연결하면서 그때 같이 붙일 예정.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const role = ADMIN_EMAILS.includes(user.email.toLowerCase()) ? "admin" : "user";
      await prisma.user.upsert({
        where: { email: user.email },
        create: { email: user.email, name: user.name, image: user.image, role },
        // 로그인할 때마다 구글 쪽 최신 이름/프로필 사진으로 갱신 — role은
        // ADMIN_EMAILS 기준으로 매번 재평가(나중에 그 목록이 바뀌어도
        // 다음 로그인 때 자동 반영되게).
        update: { name: user.name, image: user.image, role },
      });
      return true;
    },
    // user는 로그인 시점에만 존재 — 그때 우리 User 테이블에서 id/role을
    // 읽어와 token에 실어두면, 이후 요청들은 DB 조회 없이 token에서 바로
    // 꺼내 쓴다(JWT 전략의 이점).
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // next-auth v5-beta의 session 콜백 token 파라미터 타입이 types/next-auth.d.ts의
      // JWT 보강과 제대로 안 합쳐지는 경우가 있어(jwt 콜백 쪽은 정상 적용됨) 여기서만
      // 명시적으로 캐스팅한다.
      const t = token as { userId?: string; role?: string };
      if (session.user && t.userId) {
        session.user.id = t.userId;
        session.user.role = t.role ?? "user";
      }
      return session;
    },
  },
});
