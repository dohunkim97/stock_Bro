// AI briefing/prediction text now asks the model to wrap important bits in
// **bold** (see lib/market-briefing.ts, lib/weekly-prediction.ts), but the
// summary/reason strings render as plain text — this splits on **..** and
// wraps matches in <strong> so that emphasis actually shows up. Pure
// function (no hooks), safe to use from both server and client components.
export function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} style={{ fontWeight: 800 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
