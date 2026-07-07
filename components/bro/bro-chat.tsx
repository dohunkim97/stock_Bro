"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; text: string };

type SpeechRecognitionResultEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type WindowWithSpeech = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

const SUGGESTIONS = [
  "오늘 주목 섹터 3줄 요약",
  "한미반도체 지금 사도 될까?",
  "PER 62배가 무슨 뜻이야?",
  "반도체 말고 볼 섹터는?",
];

export function BroChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "안녕, 나 Bro야 👊 오늘 네가 입력한 종목이랑 시장 흐름 다 보고 있어. 궁금한 거 편하게 물어봐 — 🎙 버튼 누르면 말로 대화도 돼.",
    },
  ]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as WindowWithSpeech;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SR) {
      const r: SpeechRecognitionLike = new SR();
      r.lang = "ko-KR";
      r.interimResults = false;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const t = e.results[0][0].transcript;
        setListening(false);
        send(t);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recogRef.current = r;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  function speak(text: string) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(
        text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      );
      u.lang = "ko-KR";
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  async function send(textArg?: string) {
    const text = (textArg ?? inputRef.current?.value ?? "").trim();
    if (!text || sending) return;
    if (inputRef.current) inputRef.current.value = "";
    const history = [...messages, { role: "user" as const, text }];
    setMessages(history);
    setSending(true);
    try {
      const res = await fetch("/api/bro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : data.error;
      setMessages((s) => [...s, { role: "assistant", text: reply }]);
      if (voiceOn) speak(reply);
    } finally {
      setSending(false);
    }
  }

  function toggleMic() {
    if (!recogRef.current) {
      window.alert("이 브라우저에서는 음성 인식이 지원되지 않아요. 크롬에서 열어보세요.");
      return;
    }
    if (listening) {
      try {
        recogRef.current.stop();
      } catch {}
      setListening(false);
    } else {
      try {
        window.speechSynthesis.cancel();
        recogRef.current.start();
        setListening(true);
      } catch {}
    }
  }

  function toggleVoice() {
    if (voiceOn) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setVoiceOn((v) => !v);
  }

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "26px 24px 60px" }}>
      <section
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          height: 660,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "linear-gradient(135deg, var(--accent), var(--up))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0d13",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            B
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
              Bro{" "}
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--dim)",
                  fontWeight: 400,
                  marginLeft: 4,
                }}
              >
                투자 AI · 음성 대화
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>
              오늘 입력한 종목·시장 데이터를 기반으로 대화해요
            </div>
          </div>
          <button
            onClick={toggleVoice}
            title="음성 답변 켜기/끄기"
            style={{
              border: "1px solid var(--border)",
              background: voiceOn ? "var(--accent-soft)" : "var(--panel2)",
              color: voiceOn ? "var(--accent)" : "var(--faint)",
              cursor: "pointer",
              height: 34,
              padding: "0 12px",
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            🔊 {voiceOn ? "음성 ON" : "음성 OFF"}
          </button>
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: m.role === "assistant" ? "flex-start" : "flex-end" }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  padding: "12px 15px",
                  borderRadius: 14,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  background: m.role === "assistant" ? "var(--panel2)" : "var(--accent)",
                  color: m.role === "assistant" ? "var(--text)" : "#0a0d13",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "13px 16px",
                  borderRadius: 14,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  gap: 5,
                }}
              >
                <span style={dotStyle(0)} />
                <span style={dotStyle(0.2)} />
                <span style={dotStyle(0.4)} />
              </div>
            </div>
          )}
        </div>

        {listening && (
          <div
            style={{
              padding: "9px 20px",
              background: "var(--up-soft)",
              color: "var(--up)",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 9,
              borderTop: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--up)",
                animation: "blink 1s infinite",
              }}
            />
            듣고 있어요… 말이 끝나면 자동으로 전송돼요
          </div>
        )}

        <div
          style={{
            padding: "14px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <button
            onClick={toggleMic}
            title="음성으로 말하기"
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${listening ? "var(--up)" : "var(--border)"}`,
              background: listening ? "var(--up)" : "var(--panel2)",
              color: listening ? "#fff" : "var(--dim)",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            🎙
          </button>
          <input
            ref={inputRef}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Bro에게 물어보거나 🎙 버튼으로 말해보세요"
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 10,
              padding: "12px 14px",
              fontFamily: "var(--sans)",
              fontSize: 13.5,
              outline: "none",
            }}
          />
          <button
            onClick={() => send()}
            style={{
              flexShrink: 0,
              background: "var(--accent)",
              color: "#0a0d13",
              border: "none",
              borderRadius: 10,
              height: 44,
              padding: "0 18px",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            전송
          </button>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="chip"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--dim)",
              borderRadius: 20,
              padding: "8px 14px",
              fontSize: 12.5,
              fontFamily: "var(--sans)",
              cursor: "pointer",
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </main>
  );
}

function dotStyle(delay: number): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--dim)",
    animation: `blink 1s infinite ${delay}s`,
  };
}
