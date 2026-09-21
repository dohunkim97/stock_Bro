import type { DefaultSession } from "next-auth";

// lib/auth.ts의 session/jwt 콜백이 채워주는 커스텀 필드(id/role) 타입 보강.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
  }
}
