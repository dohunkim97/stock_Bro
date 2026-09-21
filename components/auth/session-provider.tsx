"use client";

// app/layout.tsx는 서버 컴포넌트라 next-auth/react의 useSession()을 쓰는
// 클라이언트 컴포넌트(예: user-menu.tsx)들이 컨텍스트를 받으려면 이 얇은
// 클라이언트 래퍼가 필요하다 — ThemeProvider와 같은 패턴.
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
