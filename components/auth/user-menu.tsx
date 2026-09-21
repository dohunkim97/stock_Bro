"use client";

// 헤더 오른쪽 끝(테마 토글 버튼 바로 앞)에 붙는 로그인 위젯 — 아직 어떤
// 페이지도 로그인 여부로 막지 않는다(lib/auth.ts 주석 참고), 지금은 "누가
// 로그인했고 admin인지"만 보여준다.
import { useSession, signIn, signOut } from "next-auth/react";

const pillStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--panel)",
  color: "var(--dim)",
  cursor: "pointer",
  height: 34,
  borderRadius: 9,
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: "var(--sans)",
  padding: "0 12px",
};

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div style={{ width: 34, height: 34 }} />; // 세션 확인 중 — 자리만 차지해서 레이아웃 튐 방지
  }

  if (!session?.user) {
    return (
      <button onClick={() => signIn("google")} style={pillStyle}>
        Google로 로그인
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {session.user.image && (
        // eslint-disable-next-line @next/next/no-img-element -- 구글 프로필 사진(외부 도메인), next/image 도메인 설정 없이 그냥 씀
        <img
          src={session.user.image}
          alt=""
          width={26}
          height={26}
          style={{ borderRadius: "50%", border: "1px solid var(--border)" }}
        />
      )}
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{session.user.name}</span>
      {session.user.role === "admin" && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "var(--accent)",
            background: "var(--accent-soft)",
            borderRadius: 20,
            padding: "2px 8px",
          }}
        >
          관리자
        </span>
      )}
      <button onClick={() => signOut()} style={{ ...pillStyle, height: 30, padding: "0 10px" }}>
        로그아웃
      </button>
    </div>
  );
}
