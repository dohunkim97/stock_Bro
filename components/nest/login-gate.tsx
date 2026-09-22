"use client";

// 둥지는 각자의 자산이라 로그인 없인 못 들어온다(app/nest/page.tsx) — 그
// 자리에 보여주는 안내 화면. signIn을 직접 호출해야 해서 클라이언트 컴포넌트.
import { signIn } from "next-auth/react";

export function NestLoginGate() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "120px 24px 60px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 40 }}>🪺</div>
      <div style={{ fontSize: 17, fontWeight: 800 }}>둥지는 로그인 후 이용할 수 있어요</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--faint)" }}>
        보유 종목·자산 설정은 각자 개인 자산이라, 구글 계정으로 로그인해야 나만의 둥지를 볼 수 있어요.
      </p>
      <button
        onClick={() => signIn("google")}
        style={{
          marginTop: 8,
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--text)",
          cursor: "pointer",
          height: 40,
          borderRadius: 10,
          fontSize: 13.5,
          fontWeight: 700,
          padding: "0 20px",
        }}
      >
        Google로 로그인
      </button>
    </main>
  );
}
