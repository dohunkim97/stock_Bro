import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Same gold gradient as the egg mark in components/header.tsx, just
// rendered to a static PNG for the browser tab/bookmark icon.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#14161c",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="26" viewBox="0 0 24 28">
          <defs>
            <linearGradient id="eggGrad" x1="15%" y1="10%" x2="85%" y2="95%">
              <stop offset="0%" stopColor="#fff3c4" />
              <stop offset="45%" stopColor="#f4c430" />
              <stop offset="100%" stopColor="#b8860b" />
            </linearGradient>
          </defs>
          <ellipse cx="12" cy="15" rx="10" ry="12" fill="url(#eggGrad)" stroke="#8a6200" strokeWidth="1" />
          <ellipse cx="8.5" cy="9" rx="2.2" ry="3" fill="#fff8e1" opacity="0.65" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
