"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      title="삭제"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch(`/api/entries/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      style={{
        background: "transparent",
        border: "none",
        color: "var(--faint)",
        cursor: pending ? "default" : "pointer",
        fontSize: 13,
        padding: "0 0 0 6px",
        opacity: pending ? 0.4 : 1,
      }}
    >
      ×
    </button>
  );
}
