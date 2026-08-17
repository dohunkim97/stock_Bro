"use client";

import { useId } from "react";

// A little mascot loader for pages whose data comes from slow live API
// calls (KIS / data.go.kr — see app/stock/page.tsx and app/bro/page.tsx,
// both of which can genuinely take several seconds to many-second-long
// waits). A duck waddles across the ground and lays a golden egg partway
// through, echoing the golden-egg mark in the header logo — decorative
// only, exists so the wait feels alive instead of frozen.
export function DuckLoader({ label = "골구로 불러오는중..!" }: { label?: string }) {
  const eggGradId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "28px 0" }}>
      <div className="duck-loader-track">
        <div className="duck-loader-ground" />

        <div className="duck-loader-egg">
          <svg width="22" height="26" viewBox="0 0 24 28" aria-hidden>
            <defs>
              <linearGradient id={eggGradId} x1="15%" y1="10%" x2="85%" y2="95%">
                <stop offset="0%" stopColor="#fff3c4" />
                <stop offset="45%" stopColor="#f4c430" />
                <stop offset="100%" stopColor="#b8860b" />
              </linearGradient>
            </defs>
            <ellipse cx="12" cy="15" rx="10" ry="12" fill={`url(#${eggGradId})`} stroke="#8a6200" strokeWidth="1" />
            <ellipse cx="8.5" cy="9" rx="2.2" ry="3" fill="#fff8e1" opacity="0.65" />
          </svg>
        </div>

        <div className="duck-loader-duck">
          <div className="duck-loader-bob">
            <svg width="58" height="46" viewBox="0 0 58 46" aria-hidden>
              <path d="M6 30 L16 24 L16 33 Z" fill="#f5ecd2" stroke="#8a6200" strokeWidth="1" />
              <ellipse cx="26" cy="27" rx="18" ry="13" fill="#fff8e1" stroke="#8a6200" strokeWidth="1.3" />
              <path d="M16 22 Q26 18 33 26 Q24 30 15 27 Z" fill="#f0e2b8" />
              <circle cx="42" cy="14" r="9.5" fill="#fff8e1" stroke="#8a6200" strokeWidth="1.3" />
              <path d="M50 12 L58 14.5 L50 17.5 Z" fill="#f4a637" stroke="#c97a12" strokeWidth="1" />
              <circle cx="45" cy="12" r="1.6" fill="#2a2015" />
              <path className="duck-loader-foot-back" d="M20 38 L16 44 L24 44 L22 38 Z" fill="#f4a637" stroke="#c97a12" strokeWidth="1" />
              <path className="duck-loader-foot-front" d="M32 38 L28 44 L36 44 L34 38 Z" fill="#f4a637" stroke="#c97a12" strokeWidth="1" />
            </svg>
          </div>
        </div>
      </div>

      {label && <span style={{ fontSize: 12.5, color: "var(--faint)", fontFamily: "var(--mono)" }}>{label}</span>}
    </div>
  );
}
