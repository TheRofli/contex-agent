import { requestUrl } from "obsidian";
import type { ContexSettings, WebSearchResult, WebSourceType } from "../types";

export interface WebSearchResponse {
  provider: string;
  fallbackReason?: string;
  results: WebSearchResult[];
}

interface SearxngResponse {
  results?: SearxngResult[];
}

interface SearxngResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  snippet?: unknown;
  engine?: unknown;
  engines?: unknown;
  publishedDate?: unknown;
  score?: unknown;
}

const WEB_QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "current",
  "for",
  "from",
  "in",
  "is",
  "latest",
  "me",
  "news",
  "of",
  "on",
  "please",
  "the",
  "today",
  "top",
  "what",
  "with",
  "мне",
  "найди",
  "новости",
  "последние",
  "пожалуйста",
  "про",
  "сегодня",
  "что"
]);

const WEB_STRONG_QUERY_TERMS = new Set([
  "agent",
  "ai",
  "benchmark",
  "gemma",
  "gpu",
  "inference",
  "llama",
  "llm",
  "mistral",
  "model",
  "models",
  "onnx",
  "qwen",
  "rag",
  "stt",
  "tts",
  "whisper",
  "агент",
  "ии",
  "модель",
  "модели"
]);

export async function searchWeb(
  settings: ContexSettings,
  query: string
): Promise<WebSearchResponse> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      provider: settings.webSearchProvider,
      results: []
    };
  }

  if (!settings.webSearchEnabled) {
    throw new Error("Web search is disabled. Enable it in Mindo settings.");
  }

  if (settings.webSearchProvider === "duckduckgo") {
    return {
      provider: "DuckDuckGo direct",
      results: annotateWebResults(
        rankWebResults(
          await searchDuckDuckGo(settings, trimmedQuery),
          trimmedQuery,
          getMaxWebResults(settings)
        ),
        trimmedQuery
      )
    };
  }

  if (settings.webSearchProvider === "searxng") {
    try {
      return {
        provider: "SearXNG",
        results: annotateWebResults(
          rankWebResults(
            await searchSearxng(settings, trimmedQuery),
            trimmedQuery,
            getMaxWebResults(settings)
          ),
          trimmedQuery
        )
      };
    } catch (error) {
      const message = getErrorMessage(error);

      if (isConnectionFailure(message)) {
        return {
          provider: "DuckDuckGo direct",
          fallbackReason: `SearXNG unavailable: ${message}`,
          results: annotateWebResults(
            rankWebResults(
              await searchDuckDuckGo(settings, trimmedQuery),
              trimmedQuery,
              getMaxWebResults(settings)
            ),
            trimmedQuery
          )
        };
      }

      throw error;
    }
  }

  throw new Error(`Unsupported web search provider: ${settings.webSearchProvider}`);
}

export function formatWebSearchResults(
  query: string,
  results: WebSearchResult[],
  provider?: string,
  fallbackReason?: string
): string {
  if (!results.length) {
    return `No web results found for "${query}".`;
  }

  return [
    `Web results for "${query}"`,
    provider ? `Provider: ${provider}` : "",
    fallbackReason ? `Fallback: ${fallbackReason}` : "",
    "",
    ...results.map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        result.url,
        result.source ? `Source: ${result.source}` : "",
        result.publishedDate ? `Published: ${result.publishedDate}` : "",
        result.snippet
      ]
        .filter(Boolean)
        .join("\n")
    )
  ].join("\n\n");
}

export function formatWebSearchContext(results: WebSearchResult[]): string {
  return results
    .map((result, index) =>
      [
        `Source ${index + 1}`,
        `Title: ${result.title}`,
        `URL: ${result.url}`,
        result.source ? `Engine: ${result.source}` : "",
        result.sourceType ? `Type: ${result.sourceType}` : "",
        result.publishedDate ? `Published: ${result.publishedDate}` : "",
        result.freshnessHint ? `Date signal: ${result.freshnessHint}` : "",
        result.qualityNotes?.length
          ? `Quality notes: ${result.qualityNotes.join("; ")}`
          : "",
        `Snippet: ${result.snippet}`
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

async function searchSearxng(
  settings: ContexSettings,
  query: string
): Promise<WebSearchResult[]> {
  const url = buildSearxngUrl(settings.webSearchEndpoint, query);
  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    throw: false
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`SearXNG search failed with HTTP ${response.status}.`);
  }

  const json = response.json as SearxngResponse | undefined;
  const maxResults = getRawWebResultLimit(settings);

  return (json?.results ?? [])
    .map(parseSearxngResult)
    .filter((result): result is WebSearchResult => Boolean(result))
    .slice(0, maxResults);
}

async function searchDuckDuckGo(
  settings: ContexSettings,
  query: string
): Promise<WebSearchResult[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await requestUrl({
    url: url.toString(),
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Mindo/0.1"
    },
    throw: false
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`DuckDuckGo search failed with HTTP ${response.status}.`);
  }

  const html = response.text;
  const maxResults = getRawWebResultLimit(settings);

  return parseDuckDuckGoHtml(html).slice(0, maxResults);
}

function getMaxWebResults(settings: ContexSettings): number {
  return Math.min(12, Math.max(1, settings.webSearchMaxResults || 6));
}

function getRawWebResultLimit(settings: ContexSettings): number {
  return Math.min(30, Math.max(getMaxWebResults(settings) * 3, 12));
}

function buildSearxngUrl(endpoint: string, query: string): string {
  const base = endpoint.trim() || "http://127.0.0.1:8080/search";
  const url = new URL(base);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  return url.toString();
}

function parseSearxngResult(result: SearxngResult): WebSearchResult | null {
  const title = toCleanString(result.title);
  const url = toCleanString(result.url);
  const snippet =
    toCleanString(result.content) || toCleanString(result.snippet);

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    snippet,
    source: formatEngineName(result.engine ?? result.engines),
    publishedDate: toCleanString(result.publishedDate) || undefined,
    score:
      typeof result.score === "number" && Number.isFinite(result.score)
        ? result.score
        : undefined
  };
}

function parseDuckDuckGoHtml(html: string): WebSearchResult[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const results = Array.from(document.querySelectorAll(".result"));

  return results
    .map((result): WebSearchResult | null => {
      const linkEl =
        result.querySelector<HTMLAnchorElement>(".result__a") ??
        result.querySelector<HTMLAnchorElement>("a[href]");
      const title = linkEl?.textContent?.trim() ?? "";
      const rawUrl = linkEl?.getAttribute("href") ?? "";
      const url = normalizeDuckDuckGoResultUrl(rawUrl);
      const snippet =
        result.querySelector(".result__snippet")?.textContent?.trim() ??
        result.querySelector(".result__body")?.textContent?.trim() ??
        "";

      if (!title || !url) {
        return null;
      }

      return {
        title,
        url,
        snippet,
        source: "DuckDuckGo"
      };
    })
    .filter((result): result is WebSearchResult => Boolean(result));
}

function rankWebResults(
  results: WebSearchResult[],
  query: string,
  limit: number
): WebSearchResult[] {
  const terms = tokenizeWebQuery(query);

  if (!terms.length) {
    return results.slice(0, limit);
  }

  const strongTerms = terms.filter(isStrongWebTerm);
  const scoredResults = results.map((result, index) => {
    const score = scoreWebResult(result, terms);
    const strongScore = scoreWebResult(result, strongTerms);

    return {
      result,
      index,
      score,
      strongScore
    };
  });

  const filteredResults = scoredResults.filter(
    (item) => item.score > 0 && (!strongTerms.length || item.strongScore > 0)
  );
  const rankedResults = (filteredResults.length ? filteredResults : scoredResults)
    .filter((item) => item.score > 0 || filteredResults.length === 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.result);

  return rankedResults.length ? rankedResults : results.slice(0, limit);
}

function annotateWebResults(
  results: WebSearchResult[],
  query: string
): WebSearchResult[] {
  const newsIntent = isWebNewsIntent(query);

  return results.map((result) => {
    const sourceType = classifyWebSource(result);
    const freshnessHint =
      result.publishedDate || extractFreshnessHint(result) || undefined;
    const qualityNotes = buildWebQualityNotes(
      result,
      sourceType,
      freshnessHint,
      newsIntent
    );

    return {
      ...result,
      sourceType,
      freshnessHint,
      qualityNotes
    };
  });
}

function classifyWebSource(result: WebSearchResult): WebSourceType {
  const haystack = `${result.title}\n${result.url}\n${result.snippet}`.toLowerCase();

  if (
    /\b(release|released|launch|launched|announcement|announces|changelog|version|v\d+(?:\.\d+)*)\b/.test(
      haystack
    ) ||
    haystack.includes("/releases") ||
    haystack.includes("github.com")
  ) {
    return "release";
  }

  if (
    /\b(news|breaking|today|latest updates?)\b/.test(haystack) ||
    haystack.includes("/news/")
  ) {
    return "news";
  }

  if (
    /\b(blog|dev community|medium|substack)\b/.test(haystack) ||
    haystack.includes("/blog/")
  ) {
    return "blog";
  }

  if (
    /\b(guide|ultimate guide|best|top \d+|how to|tools?|models? to run|benchmarks?)\b/.test(
      haystack
    )
  ) {
    return "guide";
  }

  if (/\b(docs|documentation|manual|reference)\b/.test(haystack)) {
    return "docs";
  }

  return "reference";
}

function buildWebQualityNotes(
  result: WebSearchResult,
  sourceType: WebSourceType,
  freshnessHint: string | undefined,
  newsIntent: boolean
): string[] {
  const notes: string[] = [];

  if (newsIntent && sourceType === "guide") {
    notes.push("overview/guide, not a direct news item");
  }

  if (newsIntent && !freshnessHint) {
    notes.push("no clear publication date in result snippet");
  }

  if (sourceType === "release") {
    notes.push("stronger signal for recent change or announcement");
  }

  if (isLikelySeoRoundup(result)) {
    notes.push("likely SEO roundup");
  }

  return notes;
}

function isWebNewsIntent(query: string): boolean {
  return /\b(latest|current|today|news|recent|release|released|announcement|changelog)\b/i.test(
    query
  );
}

function extractFreshnessHint(result: WebSearchResult): string | null {
  const haystack = `${result.title}\n${result.snippet}`;
  const match = haystack.match(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b|\b20\d{2}-\d{2}-\d{2}\b|\b20\d{2}\b/i
  );

  return match?.[0] ?? null;
}

function isLikelySeoRoundup(result: WebSearchResult): boolean {
  const haystack = `${result.title}\n${result.snippet}`.toLowerCase();

  return /\b(best|top \d+|ultimate guide|tools? to run|benchmarks? \+ use cases)\b/.test(
    haystack
  );
}

function scoreWebResult(result: WebSearchResult, terms: string[]): number {
  if (!terms.length) {
    return 0;
  }

  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const url = result.url.toLowerCase();

  return terms.reduce((score, term) => {
    let nextScore = score;

    if (title.includes(term)) {
      nextScore += 5;
    }

    if (snippet.includes(term)) {
      nextScore += 2;
    }

    if (url.includes(term)) {
      nextScore += 1;
    }

    return nextScore;
  }, 0);
}

function tokenizeWebQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !WEB_QUERY_STOP_WORDS.has(term))
    )
  ).slice(0, 18);
}

function isStrongWebTerm(term: string): boolean {
  return WEB_STRONG_QUERY_TERMS.has(term) || term.startsWith("llm");
}

function normalizeDuckDuckGoResultUrl(rawUrl: string): string {
  if (!rawUrl) {
    return "";
  }

  try {
    const url = rawUrl.startsWith("//")
      ? new URL(`https:${rawUrl}`)
      : new URL(rawUrl, "https://duckduckgo.com");
    const redirectedUrl = url.searchParams.get("uddg");

    return redirectedUrl ? decodeURIComponent(redirectedUrl) : url.toString();
  } catch {
    return rawUrl;
  }
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatEngineName(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ") || undefined;
  }

  return undefined;
}

function isConnectionFailure(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  return (
    lowerMessage.includes("err_connection_refused") ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("econnrefused")
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
