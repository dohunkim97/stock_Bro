import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 빌드할 때의 Vercel 환경(production/preview/development)을 앱 코드에 고정해 넣는다(2026-11-18).
  // 실행 중 VERCEL_ENV는 Vercel의 "시스템 환경변수 자동 노출" 설정이 꺼지면 비어 있을 수 있는데,
  // 그러면 Preview 배포가 운영 DB 주소를 쓰게 된다. 빌드 시점 값은 항상 있으므로 이것으로도 판단한다(lib/db-url.ts).
  env: {
    GOLGOO_BUILD_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
};

export default nextConfig;
