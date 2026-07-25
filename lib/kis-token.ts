// KIS (한국투자증권) OAuth token — issued tokens are valid ~24h and KIS
// asks that you not re-issue on every request, so this caches the token in
// the DB (a single row) and only fetches a new one once it's actually
// close to expiring. Serverless functions don't share memory between
// invocations, so an in-process cache alone wouldn't survive cold starts.

import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://openapi.koreainvestment.com:9443/oauth2/tokenP";
const TOKEN_ROW_ID = "singleton";
const EXPIRY_SAFETY_MARGIN_MS = 10 * 60 * 1000; // refresh 10 min before actual expiry

async function issueToken(appKey: string, appSecret: string): Promise<{ accessToken: string; expiresAt: Date } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const accessToken = json?.access_token as string | undefined;
    const expiresIn = Number(json?.expires_in); // seconds
    if (!accessToken || !Number.isFinite(expiresIn)) return null;
    return { accessToken, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  } catch {
    return null;
  }
}

export async function getKisAccessToken(): Promise<string | null> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  const cached = await prisma.kisToken.findUnique({ where: { id: TOKEN_ROW_ID } });
  if (cached && cached.expiresAt.getTime() - EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const fresh = await issueToken(appKey, appSecret);
  if (!fresh) return cached?.accessToken ?? null; // fall back to a stale-but-maybe-still-valid token

  await prisma.kisToken.upsert({
    where: { id: TOKEN_ROW_ID },
    create: { id: TOKEN_ROW_ID, accessToken: fresh.accessToken, expiresAt: fresh.expiresAt },
    update: { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt },
  });

  return fresh.accessToken;
}
