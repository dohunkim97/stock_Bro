"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "./theme-provider";

const NAV_ITEMS = [
  { href: "/market", label: "Market" },
  { href: "/stock", label: "종목 상세" },
  { href: "/bro", label: "Bro" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function useClockLabel() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const w = WEEKDAYS[now.getDay()];
      const hour = now.getHours();
      const status = hour >= 9 && hour < 15.5 ? "장중" : "장마감";
      setLabel(`${y}.${m}.${d} (${w}) ${status}`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);
  return label;
}

export function Header() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const clockLabel = useClockLabel();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 24px",
        height: 60,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0a0d13",
            fontWeight: 800,
            fontSize: 15,
            fontFamily: "var(--mono)",
          }}
        >
          시
        </div>
        <span style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: "-0.02em" }}>
          시선<span style={{ color: "var(--accent)" }}>.</span>주식
        </span>
        <span
          style={{
            color: "var(--faint)",
            fontSize: 11,
            fontFamily: "var(--mono)",
            border: "1px solid var(--border)",
            padding: "2px 6px",
            borderRadius: 5,
            letterSpacing: "0.04em",
          }}
        >
          KRX
        </span>
      </div>

      <nav
        style={{
          display: "flex",
          gap: 2,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 3,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <button
                style={{
                  border: "none",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "7px 15px",
                  borderRadius: 7,
                  whiteSpace: "nowrap",
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "#0a0d13" : "var(--dim)",
                  transition: "all .15s",
                }}
              >
                {item.label}
              </button>
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontFamily: "var(--mono)",
          fontSize: 12,
          color: "var(--dim)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--up)",
            animation: "blink 1.6s infinite",
          }}
        />
        <span>{clockLabel}</span>
      </div>
      <button
        onClick={toggleTheme}
        style={{
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--dim)",
          cursor: "pointer",
          width: 34,
          height: 34,
          borderRadius: 9,
          fontSize: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {theme === "dark" ? "☾" : "☀"}
      </button>
    </header>
  );
}
