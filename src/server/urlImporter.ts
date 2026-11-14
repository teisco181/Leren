import dns from "dns/promises";
import net from "net";
import { MODEL_NAME, generateContentWithFailover } from "./geminiClient";

export interface ImportedUrlMaterial {
  title: string;
  subject: string;
  content: string;
  sourceUrl: string;
  sourceKind: "youtube" | "website";
  mimeType: string;
  notice?: string;
}

const FETCH_TIMEOUT_MS = 16000;
const MAX_DOWNLOAD_BYTES = 3 * 1024 * 1024; // 3 MB

function isPrivateOrBlockedIp(ip: string): boolean {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true;
    }
    if (lower.startsWith("::ffff:")) {
      return isPrivateOrBlockedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    throw new Error("Vul een geldige website- of YouTube-link in.");
  }
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Deze link is geen geldig webadres (controleer of de URL klopt).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Alleen http:// en https:// links worden ondersteund.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Lokale of interne netwerkadressen kunnen niet worden uitgelezen.");
  }
  if (net.isIP(host)) {
    if (isPrivateOrBlockedIp(host)) {
      throw new Error("Dit IP-adres is niet toegestaan.");
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some((r) => isPrivateOrBlockedIp(r.address))) {
      throw new Error("Dit domein verwijst naar een niet-openbaar adres.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("adres")) throw err;
    throw new Error("Kon de domeinnaam niet bereiken. Controleer of de link klopt.");
  }
  return parsed;
}

async function fetchTextSafe(
  rawUrl: string,
  extraHeaders?: Record<string, string>
): Promise<{ finalUrl: string; contentType: string; text: string }> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop < 5; hop++) {
    const safeUrl = await assertSafePublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(safeUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "nl-NL,nl;q=0.95,en-US;q=0.85,en;q=0.7",
          Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5",
          ...extraHeaders,
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("De link gaf een ongeldige doorverwijzing terug.");
        }
        currentUrl = new URL(location, safeUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`De pagina kon niet worden geladen (HTTP ${response.status}).`);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (
        contentType &&
        !contentType.includes("text/") &&
        !contentType.includes("html") &&
        !contentType.includes("xml") &&
        !contentType.includes("json")
      ) {
        throw new Error(
          `Dit linktype (${contentType.split(";")[0]}) is geen webpagina of tekst om uit te lezen.`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          finalUrl: safeUrl.toString(),
          contentType,
          text: await response.text(),
        };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_DOWNLOAD_BYTES) {
            chunks.push(value.subarray(0, Math.max(0, MAX_DOWNLOAD_BYTES - (total - value.byteLength))));
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
      }
      const merged = Buffer.concat(chunks);
      return {
        finalUrl: safeUrl.toString(),
        contentType,
        text: merged.toString("utf8"),
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Het laden van deze link duurde te lang (time-out).");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Te veel doorverwijzingen op deze link.");
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    hellip: "...",
    bull: "•",
    euro: "€",
    eacute: "é",
    egrave: "è",
    euml: "ë",
    iuml: "ï",
    ouml: "ö",
    uuml: "ü",
    aacute: "á",
    agrave: "à",
  };
  return input
    .replace(/&([a-zA-Z]+);/g, (m, name) => named[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    });
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const seg = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-zA-Z0-9_-]{6,20}$/.test(seg) ? seg : null;
  }
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{6,20}$/.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0])) {
      return /^[a-zA-Z0-9_-]{6,20}$/.test(parts[1]) ? parts[1] : null;
    }
  }
  return null;
}

function extractBalancedJsonObject(html: string, marker: string): Record<string, unknown> | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx + marker.length);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < html.length && i < start + 600000; i++) {
    const ch = html[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const rawJson = html.slice(start, i + 1);
        try {
          return JSON.parse(rawJson) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseYouTubeCaptionsXml(xml: string): string[] {
  const lines: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const cleaned = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) lines.push(cleaned);
  }
  return lines;
}

function groupTranscriptParagraphs(segments: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let charCount = 0;

  for (const seg of segments) {
    current.push(seg);
    charCount += seg.length + 1;
    const endsSentence = /[.!?]$/.test(seg);
    if ((charCount >= 320 && endsSentence) || charCount >= 520) {
      paragraphs.push(current.join(" "));
      current = [];
      charCount = 0;
    }
  }
  if (current.length > 0) {
    paragraphs.push(current.join(" "));
  }
  return paragraphs.join("\n\n");
}

function getMetaTag(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return "";
}

function htmlToCleanMarkdown(rawHtml: string, fallbackUrl: string): {
  title: string;
  siteName: string;
  description: string;
  markdown: string;
} {
  const ogTitle = getMetaTag(rawHtml, "og:title");
  const siteName = getMetaTag(rawHtml, "og:site_name") || new URL(fallbackUrl).hostname.replace(/^www\./, "");
  const metaDesc = getMetaTag(rawHtml, "description") || getMetaTag(rawHtml, "og:description");
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = decodeHtmlEntities((titleMatch?.[1] || "").replace(/\s+/g, " ")).trim();
  const title = (ogTitle || rawTitle || siteName || "Geïmporteerde webpagina").slice(0, 150);

  let bodyHtml = rawHtml;
  const articleMatch = rawHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = rawHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = rawHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  if (articleMatch?.[1] && articleMatch[1].replace(/<[^>]+>/g, "").trim().length > 260) {
    bodyHtml = articleMatch[1];
  } else if (mainMatch?.[1] && mainMatch[1].replace(/<[^>]+>/g, "").trim().length > 260) {
    bodyHtml = mainMatch[1];
  } else if (bodyMatch?.[1]) {
    bodyHtml = bodyMatch[1];
  }

  // Strip scripts, styles, nav chrome, cookie banners, forms
  bodyHtml = bodyHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Convert structural tags into Markdown markers
  let md = bodyHtml
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|tr|table|ul|ol)>/gi, "\n\n")
    .replace(/<td[^>]*>/gi, " | ")
    .replace(/<th[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");

  md = decodeHtmlEntities(md)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Filter ultra-short boilerplate-only lines while keeping headings and real text
  const cleanedLines = md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return true;
      const lower = line.toLowerCase();
      if (
        lower === "skip to content" ||
        lower === "spring naar inhoud" ||
        lower === "cookiebeleid" ||
        lower === "accepteer cookies"
      ) {
        return false;
      }
      return true;
    });

  const markdown = cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 240000);

  return { title, siteName, description: metaDesc, markdown };
}

async function importYouTubeUrl(
  parsedUrl: URL,
  videoId: string,
  options: { allowAiFallback: boolean }
): Promise<ImportedUrlMaterial> {
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let title = "";
  let author = "";
  let shortDescription = "";
  let transcriptText = "";

  try {
    const watchRes = await fetchTextSafe(canonicalUrl);
    const playerResponse = extractBalancedJsonObject(
      watchRes.text,
      "ytInitialPlayerResponse ="
    ) as {
      videoDetails?: { title?: string; author?: string; shortDescription?: string };
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: Array<{
            baseUrl?: string;
            languageCode?: string;
            kind?: string;
          }>;
        };
      };
    } | null;

    title =
      playerResponse?.videoDetails?.title ||
      getMetaTag(watchRes.text, "og:title") ||
      "";
    author = playerResponse?.videoDetails?.author || "";
    shortDescription = playerResponse?.videoDetails?.shortDescription || "";

    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (tracks.length > 0) {
      const preferred =
        tracks.find((t) => t.languageCode === "nl" && t.kind !== "asr") ||
        tracks.find((t) => t.languageCode?.startsWith("nl")) ||
        tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
        tracks.find((t) => t.languageCode?.startsWith("en")) ||
        tracks[0];

      if (preferred?.baseUrl) {
        const capRes = await fetchTextSafe(preferred.baseUrl);
        const lines = parseYouTubeCaptionsXml(capRes.text);
        if (lines.length > 0) {
          transcriptText = groupTranscriptParagraphs(lines);
        }
      }
    }
  } catch {
    // Fallback to oEmbed below
  }

  if (!title) {
    try {
      const oembedRes = await fetchTextSafe(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
      );
      const meta = JSON.parse(oembedRes.text) as { title?: string; author_name?: string };
      title = meta.title || "";
      author = author || meta.author_name || "";
    } catch {
      // Ignore oEmbed failure
    }
  }

  let aiVideoNotes = "";
  if (!transcriptText && options.allowAiFallback) {
    try {
      const res = await generateContentWithFailover({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: canonicalUrl, mimeType: "video/*" } },
              {
                text: "Lees deze YouTube-video zorgvuldig uit en maak een heldere, volledige studienotitie in het Nederlands (Markdown) met de belangrijkste onderwerpen, uitleg, definities, voorbeelden en feiten uit de video. Blijf strikt trouw aan wat er in de video wordt uitgelegd.",
              },
            ],
          },
        ],
      });
      aiVideoNotes = (res.text || "").trim();
    } catch {
      // Fall back to description if available
    }
  }

  const finalTitle = (title || `YouTube video (${videoId})`).trim().slice(0, 150);
  const parts: string[] = [`# ${finalTitle}`];
  if (author) parts.push(`**Kanaal:** ${author}`);
  parts.push(`**Video-link:** ${canonicalUrl}`);

  if (shortDescription.trim()) {
    parts.push(`## Videobeschrijving\n${shortDescription.trim().slice(0, 6000)}`);
  }

  if (transcriptText) {
    parts.push(`## Uitgelezen video-tekst\n${transcriptText.slice(0, 220000)}`);
  } else if (aiVideoNotes) {
    parts.push(`## Uitgelezen video-inhoud\n${aiVideoNotes.slice(0, 220000)}`);
  }

  const combined = parts.join("\n\n").trim();
  const hasRealContent = Boolean(transcriptText || aiVideoNotes || shortDescription.trim().length >= 80);

  if (!hasRealContent) {
    throw new Error(
      "Deze YouTube-video heeft geen beschikbare ondertiteling of tekstbeschrijving om uit te lezen. Kies een video met ondertiteling of plak een websitelink."
    );
  }

  return {
    title: finalTitle,
    subject: "Video",
    content: combined,
    sourceUrl: canonicalUrl,
    sourceKind: "youtube",
    mimeType: "text/x-youtube",
    notice:
      !transcriptText && !aiVideoNotes
        ? "Deze video had geen ondertiteling; de titel en volledige videobeschrijving zijn uitgelezen."
        : undefined,
  };
}

async function importWebsiteUrl(
  parsedUrl: URL,
  options: { allowAiFallback: boolean }
): Promise<ImportedUrlMaterial> {
  const fetched = await fetchTextSafe(parsedUrl.toString());
  let title = new URL(fetched.finalUrl).hostname.replace(/^www\./, "");
  let bodyMarkdown = "";

  if (fetched.contentType.includes("text/plain") || fetched.contentType.includes("text/markdown")) {
    bodyMarkdown = fetched.text.trim().slice(0, 240000);
    const firstHeading = bodyMarkdown.match(/^#\s+(.+)$/m)?.[1];
    if (firstHeading) title = firstHeading.trim().slice(0, 150);
  } else {
    const parsedHtml = htmlToCleanMarkdown(fetched.text, fetched.finalUrl);
    title = parsedHtml.title;
    const descBlock =
      parsedHtml.description && !parsedHtml.markdown.includes(parsedHtml.description)
        ? `> ${parsedHtml.description}\n\n`
        : "";
    bodyMarkdown = `${descBlock}${parsedHtml.markdown}`.trim();
  }

  if (bodyMarkdown.length < 220 && options.allowAiFallback) {
    try {
      const res = await generateContentWithFailover({
        model: MODEL_NAME,
        contents: `Lees de inhoud en samenvatting op deze webpagina zorgvuldig uit en zet alle relevante leerstof, definities en kernpunten overzichtelijk in Nederlandse Markdown: ${fetched.finalUrl}`,
        config: {
          tools: [{ urlContext: {} }],
        },
      });
      const extracted = (res.text || "").trim();
      if (extracted.length > bodyMarkdown.length) {
        bodyMarkdown = extracted.slice(0, 240000);
      }
    } catch {
      // Keep whatever HTML content was extracted
    }
  }

  if (bodyMarkdown.length < 50) {
    throw new Error(
      "Deze website bevat te weinig leesbare tekst of blokkeert automatisch uitlezen (bijv. door een inlogmuur)."
    );
  }

  const finalContent = `# ${title}\n\n**Bronwebsite:** ${fetched.finalUrl}\n\n${bodyMarkdown}`.slice(
    0,
    260000
  );

  return {
    title,
    subject: "Webartikel",
    content: finalContent,
    sourceUrl: fetched.finalUrl,
    sourceKind: "website",
    mimeType: "text/html",
  };
}

export async function importStudyMaterialFromUrl(
  rawUrl: string,
  options: { allowAiFallback: boolean }
): Promise<ImportedUrlMaterial> {
  const parsed = await assertSafePublicUrl(rawUrl);
  const videoId = extractYouTubeVideoId(parsed);
  if (videoId) {
    return importYouTubeUrl(parsed, videoId, options);
  }
  return importWebsiteUrl(parsed, options);
}
