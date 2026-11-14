import crypto from "crypto";

const FIREBASE_PROJECT_ID = "gen-lang-client-0561290442";
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  name: string;
  isAnonymous: boolean;
}

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getGoogleCerts(): Promise<Record<string, string>> {
  if (Date.now() < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Kon Firebase-certificaten niet ophalen (${resp.status}).`);
  }
  const cacheControl = resp.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpiresAt = Date.now() + Math.max(60, maxAgeSec) * 1000;
  return cachedCerts;
}

function base64UrlDecode(segment: string): Buffer {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return Buffer.from(padded, "base64");
}

export async function verifyFirebaseIdToken(
  token: string
): Promise<VerifiedFirebaseUser> {
  if (!token || typeof token !== "string") {
    throw new Error("Authenticatie-token ontbreekt.");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Ongeldig tokenformaat.");
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    email?: string;
    name?: string;
    firebase?: { sign_in_provider?: string };
  };

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Ongeldig token-algoritme.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error("Token hoort niet bij dit project.");
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error("Ongeldige token-uitgever.");
  }
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
    throw new Error("Ongeldige gebruikers-ID in token.");
  }
  if (!payload.exp || payload.exp <= nowSec - 30) {
    throw new Error("Sessie is verlopen. Vernieuw je aanmelding.");
  }

  const certs = await getGoogleCerts();
  let cert = certs[header.kid];
  if (!cert) {
    // Force refresh once in case of key rotation
    certsExpiresAt = 0;
    const fresh = await getGoogleCerts();
    cert = fresh[header.kid];
  }
  if (!cert) {
    throw new Error("Onbekende ondertekeningssleutel voor Firebase-token.");
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValid = verifier.verify(cert, base64UrlDecode(sigB64));
  if (!isValid) {
    throw new Error("Ongeldige handtekening van Firebase-token.");
  }

  const isAnonymous = payload.firebase?.sign_in_provider === "anonymous";
  return {
    uid: payload.sub,
    email: payload.email || "",
    name: payload.name || payload.email?.split("@")[0] || "Speler",
    isAnonymous,
  };
}
