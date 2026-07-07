"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ExcelUploadButton({ date }: { date: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("date", date);
      form.append("file", file);
      const res = await fetch("/api/entries/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "업로드에 실패했어요", isError: true });
        return;
      }
      const summary = `거래량 상위 ${data.volumeCount}종목 · 급상승 ${data.gainerCount}종목 반영됐어요`;
      const warnings: string[] = data.warnings ?? [];
      setMessage({
        text: warnings.length ? `${summary}\n${warnings.join("\n")}` : summary,
        isError: false,
      });
      router.refresh();
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* File download from an API route, not a page — plain anchor is correct here. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/entries/template"
          style={{ fontSize: 12.5, color: "var(--dim)", textDecoration: "underline" }}
        >
          템플릿 다운로드
        </a>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          disabled={pending}
          id="excel-upload-input"
          style={{ display: "none" }}
        />
        <label
          htmlFor="excel-upload-input"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-soft)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            borderRadius: 8,
            padding: "9px 14px",
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? "default" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "업로드 중…" : "📊 엑셀로 한번에 입력"}
        </label>
      </div>
      {message && (
        <span
          style={{
            fontSize: 12,
            color: message.isError ? "var(--down)" : "var(--dim)",
            whiteSpace: "pre-wrap",
            textAlign: "right",
            maxWidth: 420,
          }}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
