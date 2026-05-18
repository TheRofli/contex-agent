import type { TFile } from "obsidian";
import { findUniqueTextOccurrence as findUniqueTextOccurrenceInContent } from "../diff/textOccurrence";
import { cleanJsonLikeResponse } from "../llm/jsonResponse";
import { formatWebSearchContext } from "../search/webSearch";
import { semanticCommandToLocalAction } from "../tools/localCommandRouter";
import {
  getFolderPath,
  inferCreateNoteTitleFromCommand
} from "./createNotePathUtils";
import {
  parseSemanticLocalCommandPlan,
  type SemanticLocalCommand
} from "./semanticLocalCommandPlan";
import type {
  AutoWebContext,
  AutoWebDecision,
  OpenFileQueryParts,
  TextOccurrenceMatch,
  VoiceMemoryIntent,
  VoiceNoteAction,
  VoiceTextReplacement
} from "./sidebarTypes";
import type {
  LlmRequestContext,
  VaultSearchResult
} from "../types";
import {
  hasExplicitWebIntent,
  isVaultLocalDescriptionRequest
} from "../chat/autoWebGuards";

const PROJECT_MEMORY_FOLDER = "Mindo Memory";

export function cleanSuggestedReplacement(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);

  return (fenceMatch?.[1] ?? trimmed).trim();
}

export function isGenerationCanceledError(error: unknown): boolean {
  return getUnknownErrorMessage(error)
    .toLowerCase()
    .includes("generation canceled");
}

export function getUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function compactSectionExcerpt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();

  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
}

export interface MarkdownSectionExcerpt {
  heading: string;
  excerpt: string;
  score: number;
}

export interface MarkdownSectionChunk {
  heading: string;
  text: string;
  index: number;
}

export function extractRelevantMarkdownSections(
  content: string,
  query: string,
  result: VaultSearchResult
): MarkdownSectionExcerpt[] {
  const terms = buildSemanticSectionTerms(query);
  const sections = splitMarkdownSections(content);
  const scoredSections = sections
    .map((section) => ({
      heading: section.heading,
      excerpt: trimMarkdownSection(section.text, 2200),
      score:
        scoreMarkdownSection(section, terms) +
        (result.heading && section.heading.includes(result.heading) ? 10 : 0),
      index: section.index
    }))
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (!scoredSections.length) {
    return [
      {
        heading: result.heading ?? "Best snippet",
        excerpt: trimMarkdownSection(result.snippet || content, 2200),
        score: result.score
      }
    ];
  }

  let remainingChars = 4200;
  const selected: MarkdownSectionExcerpt[] = [];

  for (const section of scoredSections.slice(0, 4)) {
    if (remainingChars <= 0) {
      break;
    }

    const excerpt = trimMarkdownSection(section.excerpt, remainingChars);
    remainingChars -= excerpt.length;
    selected.push({
      heading: section.heading,
      excerpt,
      score: section.score
    });
  }

  return selected;
}

export function splitMarkdownSections(content: string): MarkdownSectionChunk[] {
  const lines = content.split(/\r?\n/);
  const sections: MarkdownSectionChunk[] = [];
  let heading = "Document start";
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();

    if (text) {
      sections.push({
        heading,
        text,
        index: sections.length
      });
    }
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);

    if (headingMatch) {
      flush();
      heading = headingMatch[2].trim();
      currentLines = [];
      return;
    }

    currentLines.push(line);
  });

  flush();

  return sections.length
    ? sections
    : [
        {
          heading: "Document",
          text: content.trim(),
          index: 0
        }
      ];
}

export function buildSemanticSectionTerms(query: string): string[] {
  const baseTerms = tokenizeSemanticSectionQuery(query);
  const expandedTerms = new Set(baseTerms);

  baseTerms.forEach((term) => {
    const expansions = SEMANTIC_SECTION_TERM_EXPANSIONS[term] ?? [];
    expansions.forEach((expansion) => expandedTerms.add(expansion));
  });

  return Array.from(expandedTerms).filter((term) => term.length >= 2).slice(0, 36);
}

export function tokenizeSemanticSectionQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}_-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    )
  ).slice(0, 16);
}

export function scoreMarkdownSection(
  section: MarkdownSectionChunk,
  terms: string[]
): number {
  const heading = section.heading.toLowerCase();
  const text = section.text.toLowerCase();

  return terms.reduce((score, term) => {
    const escapedTerm = escapeRegExp(term);
    const textMatches = text.match(new RegExp(escapedTerm, "g"))?.length ?? 0;

    return (
      score +
      (heading.includes(term) ? 10 : 0) +
      Math.min(textMatches, 8)
    );
  }, 0);
}

export function trimMarkdownSection(text: string, maxChars: number): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

export const SEMANTIC_SECTION_TERM_EXPANSIONS: Record<string, string[]> = {
  architecture: ["архитектур", "system", "components", "component", "pipeline"],
  contex: ["context", "agent", "vault"],
  flow: ["workflow", "pipeline", "voice-flow", "input", "output", "transcript"],
  stt: ["speech", "transcription", "microphone", "voice", "голос"],
  tts: ["speech", "voice", "audio", "озвуч"],
  voice: ["голос", "stt", "tts", "speech", "transcription", "microphone"],
  агент: ["agent", "contex"],
  архитектура: ["architecture", "system", "components", "pipeline"],
  голос: ["voice", "stt", "tts", "speech", "transcription", "microphone"],
  флоу: ["flow", "workflow", "pipeline"]
};

export function isLocalOnlyCommandText(userRequest: string): boolean {
  const commandText = normalizeNoisyLocalCommandText(userRequest);
  const effectiveCommandText = getEffectiveLocalCommandText(commandText);
  const normalized = normalizeVoiceCommandText(effectiveCommandText);

  if (!normalized) {
    return false;
  }

  if (parseVoiceWebResearchQuery(effectiveCommandText)) {
    return false;
  }

  if (isResearchNoteCommand(effectiveCommandText)) {
    return false;
  }

  if (
    isVoiceReadLastAnswerCommand(effectiveCommandText) ||
    isVoiceStopSpeakingCommand(effectiveCommandText) ||
    isVoiceAcceptCommand(effectiveCommandText) ||
    isVoiceRejectCommand(effectiveCommandText) ||
    isVoiceUndoCommand(effectiveCommandText) ||
    isVoiceImproveSelectionCommand(effectiveCommandText) ||
    Boolean(extractVoiceTextReplacement(effectiveCommandText)) ||
    Boolean(extractVoiceReplacement(effectiveCommandText))
  ) {
    return true;
  }

  const openFileQuery = parseVoiceOpenFileQuery(effectiveCommandText);

  if (openFileQuery && isPlainOpenFileCommand(effectiveCommandText)) {
    return true;
  }

  return false;
}

export function decideAutoWebResearch(
  userRequest: string,
  context?: LlmRequestContext | null
): AutoWebDecision | null {
  const normalized = normalizeVoiceCommandText(userRequest);

  if (
    !normalized ||
    normalized.startsWith("/web") ||
    normalized.includes("без интернета") ||
    normalized.includes("не ищи в интернете") ||
    normalized.includes("without web") ||
    normalized.includes("no web")
  ) {
    return null;
  }

  if (isVaultLocalDescriptionRequest(userRequest)) {
    return null;
  }

  const explicitFreshness =
    includesAny(normalized, [
      "актуальн",
      "свеж",
      "последн",
      "современн",
      "новейш",
      "сегодня",
      "сейчас",
      "на данный момент",
      "по состоянию",
      "учитывая",
      "latest",
      "current",
      "recent",
      "today",
      "up to date",
      "as of"
    ]) || /\b20\d{2}\b/.test(normalized);
  const explicitWeb = hasExplicitWebIntent(userRequest);
  const verificationIntent = includesAny(normalized, [
    "проверь",
    "провести проверку",
    "верифиц",
    "устар",
    "обнови",
    "актуализ",
    "соответствует",
    "check",
    "verify",
    "validate",
    "outdated",
    "update"
  ]);
  const recommendationIntent = includesAny(normalized, [
    "подбери",
    "посоветуй",
    "рекоменду",
    "лучшие",
    "лучший",
    "какой выбрать",
    "что выбрать",
    "что поставить",
    "сравни",
    "recommend",
    "best",
    "choose",
    "compare"
  ]);
  const creationOrPlanningIntent = includesAny(normalized, [
    "созда",
    "сделай",
    "распиши",
    "напиши",
    "план",
    "страниц",
    "заметк",
    "roadmap",
    "create",
    "draft",
    "write",
    "plan"
  ]);
  const fastMovingDomain = includesAny(normalized, [
    "технолог",
    "фич",
    "инструмент",
    "библиотек",
    "фреймворк",
    "модель",
    "модели",
    "llm",
    "ai",
    "ии",
    "stt",
    "tts",
    "whisper",
    "kokoro",
    "silero",
    "piper",
    "onnx",
    "obsidian",
    "plugin",
    "api",
    "sdk",
    "package",
    "version",
    "feature",
    "features",
    "tool",
    "tools",
    "library",
    "libraries",
    "framework",
    "model",
    "models"
  ]);
  const volatileDomain = includesAny(normalized, [
    "цена",
    "стоимость",
    "закон",
    "правила",
    "расписание",
    "релиз",
    "анонс",
    "новост",
    "price",
    "pricing",
    "law",
    "rules",
    "release",
    "announcement",
    "news"
  ]);

  if (explicitWeb || explicitFreshness) {
    return {
      query: buildAutoWebResearchQuery(userRequest, context),
      reason: explicitWeb
        ? "User asked for web/internet-backed information."
        : "User asked for current, recent, dated, or freshness-sensitive information."
    };
  }

  if (
    (verificationIntent || recommendationIntent || creationOrPlanningIntent) &&
    (fastMovingDomain || volatileDomain)
  ) {
    return {
      query: buildAutoWebResearchQuery(userRequest, context),
      reason:
        "The task depends on tools, models, technologies, releases, or recommendations that may have changed."
    };
  }

  return null;
}

export function buildAutoWebResearchQuery(
  userRequest: string,
  context?: LlmRequestContext | null
): string {
  const topic = extractContextResearchTopic(context);
  const normalized = normalizeVoiceCommandText(userRequest);
  const vagueFreshnessRequest =
    normalized.length < 90 &&
    includesAny(normalized, [
      "проверь актуальность",
      "актуализ",
      "обнови",
      "учитывая",
      "check if",
      "verify",
      "update"
    ]);

  if (topic && vagueFreshnessRequest) {
    return `${userRequest} ${topic}`.trim();
  }

  return userRequest.trim();
}

export function extractContextResearchTopic(
  context?: LlmRequestContext | null
): string {
  const current = context?.currentNote;
  const selected = context?.selectedText;
  const sourceText = selected?.text ?? current?.content ?? "";
  const sourceName = selected?.name ?? current?.name ?? "";
  const firstHeading =
    sourceText
      .split(/\r?\n/)
      .map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() ?? "")
      .find(Boolean) ?? "";
  const firstContentLine =
    sourceText
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^[-*+]\s+/, "")
          .replace(/[*_`#>[\]().:;!?]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .find((line) => line.length > 24) ?? "";

  return [sourceName, firstHeading || firstContentLine.slice(0, 220)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function formatAutoWebContextForPrompt(webContext: AutoWebContext): string {
  return [
    "Current web context was automatically gathered for this task.",
    `Reason: ${webContext.reason}`,
    `Date checked: ${new Date().toISOString().slice(0, 10)}`,
    `User research need: ${webContext.query}`,
    `Search query: ${webContext.searchQuery}`,
    `Provider: ${webContext.provider}`,
    webContext.fallbackReason ? `Fallback: ${webContext.fallbackReason}` : "",
    "",
    "Use these sources only where they are relevant. Cite links when making current factual claims. If sources are weak, say so in the note/update.",
    "",
    "Web sources:",
    formatWebSearchContext(webContext.results)
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatProjectMemoryForPrompt(projectMemory: string): string {
  return [
    "Project memory context:",
    "Use this as durable background memory for the Mindo project. Do not copy it verbatim unless relevant.",
    projectMemory
  ].join("\n");
}

export function isProjectMemoryFile(path: string): boolean {
  const normalized = normalizeOpenFileValue(path);

  return (
    path.startsWith(`${PROJECT_MEMORY_FOLDER}/`) ||
    normalized.includes("contex memory") ||
    normalized.includes("project memory") ||
    normalized.includes("durable memory")
  );
}

export function shouldUseWebForResearchWorkflow(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return hasExplicitWebIntent(commandText) || includesAny(normalized, [
    "\u0430\u043a\u0442\u0443\u0430\u043b",
    "\u0441\u0432\u0435\u0436",
    "\u043f\u043e\u0441\u043b\u0435\u0434\u043d",
    "\u043d\u043e\u0432\u0435\u0439\u0448",
    "\u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d",
    "\u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433",
    "\u0444\u0438\u0447",
    "\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442",
    "\u043c\u043e\u0434\u0435\u043b",
    "\u0438\u0438",
    "internet",
    "latest",
    "current",
    "recent",
    "modern",
    "technology",
    "features",
    "tools",
    "models",
    "llm",
    "ai"
  ]);
}

export function sanitizeResearchTitle(title: string | undefined): string | null {
  const cleaned = (title ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[{}[\]"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3 || cleaned.toLowerCase() === "json") {
    return null;
  }

  return cleaned.slice(0, 90);
}

export function inferResearchNoteTitle(commandText: string): string {
  return sanitizeResearchTitle(
    inferCreateNoteTitleFromCommand(commandText, "Mindo Research Note")
  ) || "Mindo Research Note";
}

export function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function normalizeNoisyLocalCommandText(text: string): string {
  let normalized = text.trim();

  for (let index = 0; index < 4; index += 1) {
    const next = normalized.replace(
      /^(?:а|ну|нет|да|ладно|окей|ок|слушай|смотри|пожалуйста|плиз)[,\s]+/i,
      ""
    );

    if (next === normalized) {
      break;
    }

    normalized = next.trim();
  }

  return normalized
    .replace(/(?<![\p{L}\p{N}_])\u043e\u0442\u043a\u0440\u043e\u044e(?![\p{L}\p{N}_])/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/(?<![\p{L}\p{N}_])\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0439(?![\p{L}\p{N}_])/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/(?<![\p{L}\p{N}_])\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c(?![\p{L}\p{N}_])/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/(?<![\p{L}\p{N}_])\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u044e(?![\p{L}\p{N}_])/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/(?<![\p{L}\p{N}_])\u043e\u0442\u043a\u0440\u044b\u043b[ao\u0430\u043e]?(?![\p{L}\p{N}_])/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/(?<![\p{L}\p{N}_])\u0432\u0430\u043f\u043a[\u0430\u0438\u0435\u0443]?(?![\p{L}\p{N}_])/giu, "\u0432 \u043f\u0430\u043f\u043a\u0435")
    .replace(/\bпоменяю\b/gi, "поменяй")
    .replace(/\bзаменю\b/gi, "замени")
    .replace(/\bизменю\b/gi, "измени")
    .replace(/\bная\b/gi, "на я")
    .replace(/\bняя\b/gi, "на я")
    .replace(/\bня\s+я\b/gi, "на я")
    .replace(
      /\b(открой|открыть|покажи|найди|поищи|замени|поменяй|измени)\s*,\s*/gi,
      "$1 "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function getEffectiveLocalCommandText(commandText: string): string {
  const correctedSegment = extractCorrectedCommandSegment(commandText);

  return correctedSegment
    ? normalizeNoisyLocalCommandText(correctedSegment)
    : commandText;
}

export function extractCorrectedCommandSegment(commandText: string): string | null {
  const correctionPattern =
    /(?:^|[\s,;:.!?])(?:точнее|вернее|извиняюсь|извини|нет|а\s+не|actually|rather|instead|i\s+mean)(?:[\s,;:.!?]+|$)/giu;
  let bestSegment: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = correctionPattern.exec(commandText)) !== null) {
    const segment = commandText.slice(match.index + match[0].length).trim();

    if (segment && hasLocalCommandActionMarker(segment)) {
      bestSegment = segment;
    }
  }

  return bestSegment;
}

export function hasLocalCommandActionMarker(text: string): boolean {
  const normalized = normalizeVoiceCommandText(text);

  return [
    "созда",
    "сделай",
    "сделать",
    "завед",
    "сохрани",
    "открой",
    "открыть",
    "покажи",
    "замени",
    "заменить",
    "поменяй",
    "поменять",
    "измени",
    "исправь",
    "найди",
    "поищи",
    "запомни",
    "обнови",
    "прими",
    "принять",
    "отклони",
    "откати",
    "open",
    "show",
    "create",
    "make",
    "draft",
    "replace",
    "change",
    "search",
    "remember",
    "update",
    "accept",
    "reject",
    "undo"
  ].some((marker) => normalized.includes(marker));
}

export function extractVoiceTextReplacement(
  commandText: string
): VoiceTextReplacement | null {
  const normalized = normalizeVoiceCommandText(commandText);

  if (normalized.includes("выделенн")) {
    return null;
  }

  const commaReplaceMatch = commandText.match(
    /^(?:замени|поменяй|измени)\s*[,:\-–—]\s*([\s\S]+?)\s*[,:\-–—]\s*(?:на|но)\s+([\s\S]+?)\s*[?.!]*$/i
  );

  if (commaReplaceMatch?.[1] && commaReplaceMatch[2]) {
    return {
      original: cleanVoiceReplacementText(commaReplaceMatch[1]),
      suggested: cleanVoiceReplacementText(commaReplaceMatch[2])
    };
  }

  const quotedPatterns = [
    /^(?:замени|поменяй|измени)\s+(?:текст|фразу|слово|строку)?\s*["'«“]([^"'»”]+)["'»”]\s+(?:на|на:)\s+["'«“]([\s\S]+?)["'»”]?$/i,
    /^(?:replace|change)\s+(?:text|phrase|word|line)?\s*["'“]([^"'”]+)["'”]\s+(?:with|to)\s+["'“]([\s\S]+?)["'”]?$/i
  ];

  for (const pattern of quotedPatterns) {
    const match = commandText.match(pattern);

    if (match?.[1] && match[2]) {
      return {
        original: cleanVoiceReplacementText(match[1]),
        suggested: cleanVoiceReplacementText(match[2])
      };
    }
  }

  const unquotedPatterns = [
    /^(?:замени|поменяй|измени)\s*[,:\-–—]?\s+(?:текст|фразу|слово|строку)?\s*([\s\S]+?)\s*[,:\-–—]?\s+(?:на|на:)\s+([\s\S]+?)\s*[?.!]*$/i,
    /^(?:замени|поменяй|измени)\s+(?:текст|фразу|слово|строку)\s+([\s\S]+?)\s+(?:на|на:)\s+([\s\S]+)$/i,
    /(?:заменить|поменять|замени|поменяй)\s+([\s\S]+?)\s+(?:на|на:)\s+([\s\S]+?)[?.!]*$/i,
    /^(?:replace|change)\s+(?:text|phrase|word|line)\s+([\s\S]+?)\s+(?:with|to)\s+([\s\S]+)$/i
  ];

  for (const pattern of unquotedPatterns) {
    const match = commandText.match(pattern);

    if (match?.[1] && match[2]) {
      return {
        original: cleanVoiceReplacementText(match[1]),
        suggested: cleanVoiceReplacementText(match[2])
      };
    }
  }

  return null;
}

export function extractVoiceReplacement(commandText: string): string | null {
  const patterns = [
    /^(?:замени|поменяй|измени)\s+(?:выделенн(?:ый|ое|ую|ого)\s+)?(?:текст|фрагмент|выделение|это|этот\s+текст)?\s*(?:на|на:)\s+([\s\S]+)$/i,
    /^(?:замени|поменяй|измени)\s+на\s+([\s\S]+)$/i,
    /^(?:поставь|вставь)\s+вместо\s+(?:выделенн(?:ого|ый|ое)|этого\s+текста|текста|фрагмента)\s+([\s\S]+)$/i,
    /^(?:replace|change)\s+(?:the\s+)?(?:selection|selected\s+text|this\s+text)\s+(?:with|to)\s+([\s\S]+)$/i
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);

    if (match?.[1]) {
      return cleanVoiceReplacementText(match[1]);
    }
  }

  return null;
}

export function cleanVoiceReplacementText(text: string): string {
  return text
    .trim()
    .replace(/^(?:вот\s+это|это|следующее|так)\s*[:\-–—]?\s*/i, "")
    .replace(/^["'«“]+|["'»”]+$/g, "")
    .trim();
}

export function cleanVoiceSearchQuery(text: string): string {
  return text
    .trim()
    .replace(
      /^(?:это|вот|пожалуйста|плиз|мне|пожалуйста\s+мне|точнее|тогда)\s+/i,
      ""
    )
    .replace(/[?.!]+$/g, "")
    .replace(/^["'«“]+|["'»”]+$/g, "")
    .trim();
}

export function extractVoiceRefineInstruction(commandText: string): string | null {
  const match = commandText.match(
    /^(?:поменяй|измени|исправь|добавь|убери|сделай)\s+(?:еще|ещё|это|вариант|предложение)?\s*([\s\S]*)$/i
  );
  const instruction = match?.[1]?.trim() ?? "";

  return instruction || null;
}

export function isVoiceAcceptCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return [
    "принять",
    "прими",
    "прими это",
    "применить",
    "применить изменение",
    "применяй",
    "согласен",
    "согласна",
    "согласился",
    "согласилась",
    "да",
    "ок",
    "окей",
    "accept",
    "apply"
  ].includes(normalized);
}

export function isVoiceRejectCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return [
    "отклонить",
    "отклони",
    "отклони это",
    "отменить",
    "отмена",
    "не надо",
    "нет",
    "reject",
    "decline",
    "cancel"
  ].includes(normalized);
}

export function isVoiceUndoCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return [
    "откатить",
    "откати",
    "откати изменение",
    "верни назад",
    "отмени изменение",
    "undo",
    "rollback",
    "revert"
  ].includes(normalized);
}

export function isVoiceImproveSelectionCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return (
    normalized.includes("улучши выделенное") ||
    normalized.includes("улучши выделенный") ||
    normalized.includes("улучши этот текст") ||
    normalized.includes("улучшить выделенное") ||
    normalized.includes("улучшить выделенный") ||
    normalized.includes("исправь выделенное") ||
    normalized.includes("исправь выделенный") ||
    normalized.includes("проверь выделенное") ||
    normalized.includes("проверь выделенный") ||
    normalized.includes("перепиши выделенное") ||
    normalized.includes("перепиши выделенный") ||
    normalized.includes("перепиши этот текст") ||
    normalized === "улучши" ||
    normalized === "улучшить" ||
    normalized === "сделай лучше" ||
    normalized === "improve" ||
    normalized === "improve selection"
  );
}

export function isCreateNoteCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (!normalized) {
    return false;
  }

  const createMarkers = [
    "\u0441\u043e\u0437\u0434\u0430",
    "\u0441\u0434\u0435\u043b\u0430\u0439",
    "\u0441\u0434\u0435\u043b\u0430\u0442\u044c",
    "\u0437\u0430\u0432\u0435\u0434",
    "\u0441\u043e\u0445\u0440\u0430\u043d\u0438",
    "create",
    "make",
    "draft",
    "new note"
  ];
  const targetMarkers = [
    "\u0437\u0430\u043c\u0435\u0442\u043a",
    "\u043d\u043e\u0443\u0442",
    "\u043f\u043b\u0430\u043d",
    "\u0441\u0442\u0440\u0430\u043d\u0438\u0446",
    "\u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442",
    "\u043a\u043e\u043d\u0441\u043f\u0435\u043a\u0442",
    "\u043e\u043f\u0438\u0441\u0430\u043d",
    "note",
    "page",
    "document",
    "plan",
    "roadmap"
  ];
  const createIndex = createMarkers
    .map((marker) => normalized.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (createIndex === undefined) {
    return false;
  }

  if (!targetMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  const startsAsOpen =
    normalized.startsWith("\u043e\u0442\u043a\u0440\u043e\u0439") ||
    normalized.startsWith("\u043e\u0442\u043a\u0440\u044b\u0442\u044c") ||
    normalized.startsWith("\u043f\u043e\u043a\u0430\u0436\u0438") ||
    normalized.startsWith("open") ||
    normalized.startsWith("show");

  if (!startsAsOpen) {
    return true;
  }

  const correctionMarkers = [
    "\u0442\u043e\u0447\u043d\u0435\u0435",
    "\u0438\u0437\u0432\u0438\u043d",
    "\u043d\u0435\u0442",
    "\u0430 \u043d\u0435",
    "actually",
    "rather",
    "instead"
  ];

  return correctionMarkers.some((marker) => {
    const markerIndex = normalized.indexOf(marker);
    return markerIndex >= 0 && markerIndex < createIndex;
  });
}

export function extractCreateNoteCommandSegment(commandText: string): string | null {
  const pattern =
    /(?:\u0441\u043e\u0437\u0434\u0430|\u0441\u0434\u0435\u043b\u0430\u0439|\u0441\u0434\u0435\u043b\u0430\u0442\u044c|\u0437\u0430\u0432\u0435\u0434|\u0441\u043e\u0445\u0440\u0430\u043d\u0438|create|make|draft|new\s+note)/giu;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(commandText)) !== null) {
    lastMatch = match;
  }

  return lastMatch ? commandText.slice(lastMatch.index).trim() : null;
}

export function isResearchNoteCommand(commandText: string): boolean {
  if (!isCreateNoteCommand(commandText)) {
    return false;
  }

  const normalized = normalizeVoiceCommandText(commandText);

  return includesAny(normalized, [
    "\u0430\u043a\u0442\u0443\u0430\u043b",
    "\u0441\u0432\u0435\u0436",
    "\u043d\u043e\u0432\u0435\u0439\u0448",
    "\u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d",
    "\u0438\u0441\u0441\u043b\u0435\u0434",
    "\u0440\u0435\u0441\u0435\u0440\u0447",
    "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442",
    "\u0432\u0435\u0431",
    "\u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433",
    "\u0444\u0438\u0447",
    "\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442",
    "\u043c\u043e\u0434\u0435\u043b",
    "research",
    "web",
    "internet",
    "latest",
    "current",
    "modern",
    "up to date",
    "technology",
    "features",
    "tools",
    "models"
  ]);
}

export function isVoiceReadLastAnswerCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (
    [
      "\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0439",
      "\u043f\u0440\u043e\u0447\u0442\u0438",
      "\u043e\u0437\u0432\u0443\u0447\u044c",
      "\u0447\u0438\u0442\u0430\u0439",
      "read",
      "speak"
    ].includes(normalized)
  ) {
    return true;
  }

  return includesAny(normalized, [
    "\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0439 \u043e\u0442\u0432\u0435\u0442",
    "\u043e\u0437\u0432\u0443\u0447\u044c \u043e\u0442\u0432\u0435\u0442",
    "\u043f\u0440\u043e\u0447\u0442\u0438 \u043e\u0442\u0432\u0435\u0442",
    "\u0447\u0438\u0442\u0430\u0439 \u043e\u0442\u0432\u0435\u0442",
    "\u043f\u0440\u043e\u0447\u0438\u0442\u0430\u0439 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439",
    "read answer",
    "read latest answer",
    "speak answer",
    "voice answer"
  ]);
}

export function isVoiceStopSpeakingCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return includesAny(normalized, [
    "\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438 \u0447\u0442\u0435\u043d\u0438\u0435",
    "\u043f\u0435\u0440\u0435\u0441\u0442\u0430\u043d\u044c \u0447\u0438\u0442\u0430\u0442\u044c",
    "\u0445\u0432\u0430\u0442\u0438\u0442 \u0447\u0438\u0442\u0430\u0442\u044c",
    "\u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438 \u0433\u043e\u043b\u043e\u0441",
    "stop reading",
    "stop speaking",
    "stop voice"
  ]);
}

export function isOpenLastFileReference(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return (
    (normalized.includes("открой") || normalized.includes("открыть")) &&
    (normalized.includes("эту заметку") ||
      normalized.includes("эту") ||
      normalized.includes("этот файл") ||
      normalized.includes("найденную") ||
      normalized.includes("найденный") ||
      normalized.includes("то что наш") ||
      normalized.includes("ту заметку"))
  );
}

export function isPlainOpenFileCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (
    !includesAny(normalized, [
      "открой",
      "открыть",
      "покажи",
      "open",
      "show"
    ])
  ) {
    return false;
  }

  return !includesAny(normalized, [
    "созда",
    "сделай",
    "сделать",
    "завед",
    "замени",
    "заменить",
    "помен",
    "измен",
    "исправ",
    "обнови",
    "актуальн",
    "найди",
    "поищи",
    "интернет",
    "веб",
    "research",
    "web",
    "internet",
    "create",
    "make",
    "draft",
    "replace",
    "change",
    "update"
  ]);
}

export function isBareOpenFileCorrection(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return /^(?:именно|точно)\s+[\p{L}\p{N}_ -]{2,}$/iu.test(normalized);
}

export function parseVoiceOpenFileQuery(commandText: string): string | null {
  const normalized = normalizeVoiceCommandText(commandText);

  if (
    normalized === "открой его" ||
    normalized === "открой ее" ||
    normalized === "открой её" ||
    normalized === "открой это" ||
    normalized === "открой эту заметку" ||
    normalized === "открой эту" ||
    normalized === "открой этот файл" ||
    normalized.includes("открыть эту заметку") ||
    normalized.includes("открой найденную") ||
    normalized.includes("открой найденный") ||
    normalized === "open it" ||
    normalized === "open that file"
  ) {
    return null;
  }

  const patterns = [
    /^(?:а\s+|ну\s+|ладно\s+|пожалуйста\s+)*(?:открой|открывай|открываем|открываю|открыть|покажи|show|open)\s+(?:пожалуйста\s+)?(?:мне\s+)?(?:(?:пожалуйста|точнее|тогда)\s+)?(?:(?:файл|заметку|ноус|note)\s+)?([\s\S]+)$/i,
    /^(?:а\s+|ну\s+|ладно\s+|пожалуйста\s+)*(?:(?:можно|можешь|можете|can\s+you)\s+)?(?:открыть|показать|open|show)\s+(?:мне\s+)?(?:(?:файл|заметку|ноус|note)\s+)?([\s\S]+)$/i,
    /^(?:именно|точно)\s+([\s\S]+)$/i
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);
    const query = match?.[1] ? cleanVoiceOpenFileQuery(match[1]) : "";

    if (query) {
      return query;
    }
  }

  return null;
}

export function cleanVoiceOpenFileQuery(text: string): string {
  const query = cleanVoiceSearchQuery(text)
    .replace(/\b(?:file|note)\b/gi, " ")
    .replace(/(?:^|[^\p{L}\p{N}_-])(?:файл|заметк[ауи]?|ноус|note)(?=$|[^\p{L}\p{N}_-])/giu, " ")
    .replace(/\bстат\s*(\d+)\b/gi, "stat$1")
    .replace(/\bstat\s+(\d+)\b/gi, "stat$1")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:его|ее|её|это|этот|найденный|найденное|it|that)$/i.test(query)
    ? ""
    : query;
}

export function extractRequestedFolderName(commandText: string): string | null {
  const patterns = [
    /(?:^|[\s,;:])(?:в|из)\s+(?:папк|парк)[еи]\s+([\p{L}\p{N}_ -]+?)(?=\s+(?:созда|сдела|завед|план|заметк|note|file)\b|[,.!?;:]|$)/iu,
    /(?:^|[\s,;:])(?:in|inside)\s+(?:the\s+)?folder\s+([\p{L}\p{N}_ -]+?)(?=\s+(?:create|make|draft|new|note|file|plan)\b|[,.!?;:]|$)/iu
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);
    const folder = match?.[1]
      ?.replace(/\b(?:и|and)\b.*$/i, "")
      .trim();

    if (folder) {
      return folder;
    }
  }

  return null;
}

export function parseOpenFileQueryParts(query: string): OpenFileQueryParts {
  const folderQuery = extractRequestedFolderName(query) ?? undefined;
  const fileQuery = folderQuery
    ? stripRequestedFolderClause(query, folderQuery)
    : query;

  return {
    fileQuery: cleanLooseOpenFileQuery(fileQuery) || query,
    folderQuery: folderQuery ? cleanLooseOpenFileQuery(folderQuery) : undefined
  };
}

export function stripRequestedFolderClause(query: string, folderQuery: string): string {
  const escapedFolder = escapeRegExp(folderQuery);

  return query
    .replace(
      new RegExp(
        `(?:^|[\\s,;:])(?:в|из)\\s+(?:папк|парк)[еи]\\s+${escapedFolder}(?=\\s|[,.!?;:]|$)`,
        "iu"
      ),
      " "
    )
    .replace(
      new RegExp(
        `(?:^|[\\s,;:])(?:in|inside)\\s+(?:the\\s+)?folder\\s+${escapedFolder}(?=\\s|[,.!?;:]|$)`,
        "iu"
      ),
      " "
    );
}

export function cleanLooseOpenFileQuery(query: string): string {
  return query
    .replace(/(?:^|[\s,;:])(?:в|из)\s+(?:папк|парк)[еи](?=$|[\s,;:.!?])/giu, " ")
    .replace(/(?:^|[\s,;:])(?:(?:папк|парк)[аеуы]?|folder)(?=$|[\s,;:.!?])/giu, " ")
    .replace(/(?:^|[\s,;:])(?:файл|заметк[ауи]?|ноус|note)(?=$|[\s,;:.!?])/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreVaultFolderCandidate(
  folder: string,
  normalizedQuery: string
): number {
  const normalizedFolder = normalizeOpenFileValue(folder);
  const folderName = normalizeOpenFileValue(folder.split("/").pop() ?? folder);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = 0;

  if (folderName === normalizedQuery) {
    score += 500;
  } else if (normalizedFolder === normalizedQuery) {
    score += 420;
  } else if (normalizedFolder.endsWith(` ${normalizedQuery}`)) {
    score += 260;
  } else if (normalizedFolder.includes(normalizedQuery)) {
    score += 160;
  }

  tokens.forEach((token) => {
    if (folderName === token) {
      score += 140;
    } else if (folderName.includes(token)) {
      score += 70;
    } else if (normalizedFolder.includes(token)) {
      score += 35;
    } else {
      const bestTokenSimilarity = getBestTokenSimilarity(
        token,
        normalizedFolder
      );

      if (bestTokenSimilarity >= 0.62) {
        score += Math.round(bestTokenSimilarity * 55);
      }
    }
  });

  const folderNameSimilarity = getOpenFileSimilarity(normalizedQuery, folderName);
  const folderPathSimilarity = getOpenFileSimilarity(
    normalizedQuery,
    normalizedFolder
  );
  const bestSimilarity = Math.max(folderNameSimilarity, folderPathSimilarity);

  if (bestSimilarity >= 0.56) {
    score += Math.round(bestSimilarity * 140);
  }

  return score;
}

export function scoreOpenFileCandidate(
  file: TFile,
  query: string,
  folderQuery?: string
): number {
  const normalizedQuery = normalizeOpenFileValue(query);
  const normalizedFolderQuery = folderQuery
    ? normalizeOpenFileValue(folderQuery)
    : "";
  const tokens = tokenizeOpenFileQuery(query);

  if (!normalizedQuery || !tokens.length) {
    return 0;
  }

  const firstToken = tokens[0];
  const normalizedBasename = normalizeOpenFileValue(file.basename);
  const normalizedPath = normalizeOpenFileValue(file.path);
  const normalizedFolder = normalizeOpenFileValue(getFolderPath(file.path));
  let score = 0;

  if (normalizedFolderQuery) {
    const folderScore = scoreVaultFolderCandidate(
      getFolderPath(file.path),
      normalizedFolderQuery
    );

    if (folderScore <= 0) {
      return 0;
    }

    score += folderScore * 3;
  }

  if (normalizedPath === normalizedQuery) {
    score += 500;
  } else if (normalizedPath.includes(normalizedQuery)) {
    score += 260;
  }

  if (normalizedBasename === normalizedQuery) {
    score += 300;
  } else if (normalizedBasename.includes(normalizedQuery)) {
    score += 170;
  }

  if (firstToken) {
    if (normalizedBasename === firstToken) {
      score += 260;
    } else if (normalizedBasename.includes(firstToken)) {
      score += 150;
    } else if (!normalizedPath.includes(firstToken)) {
      score -= 80;
    }
  }

  tokens.forEach((token, index) => {
    const isFirstToken = index === 0;

    if (normalizedBasename === token) {
      score += isFirstToken ? 220 : 90;
    } else if (normalizedBasename.includes(token)) {
      score += isFirstToken ? 140 : 45;
    }

    if (normalizedFolder.split(" ").includes(token)) {
      score += 45;
    } else if (normalizedFolder.includes(token)) {
      score += 25;
    }

    if (normalizedPath.includes(token)) {
      score += 25;
    }
  });

  const coveredTokens = tokens.filter((token) =>
    normalizedPath.includes(token)
  ).length;

  if (coveredTokens < tokens.length) {
    score -= (tokens.length - coveredTokens) * 25;
  }

  return Math.max(0, score);
}

export function tokenizeOpenFileQuery(query: string): string[] {
  return Array.from(
    new Set(
      normalizeOpenFileValue(query)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

export function normalizeOpenFileValue(value: string): string {
  return transliterateCyrillicToLatin(value.toLowerCase())
    .replace(/\.md\b/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/(?:^|[^\p{L}\p{N}_-])stat\s*(\d+)(?=$|[^\p{L}\p{N}_-])/giu, " stat$1")
    .replace(/\bstat\s+(\d+)\b/gi, "stat$1")
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function transliterateCyrillicToLatin(value: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya"
  };

  return value.replace(/[а-яё]/gi, (char) => map[char.toLowerCase()] ?? char);
}

export function getBestTokenSimilarity(queryToken: string, target: string): number {
  return target
    .split(/\s+/)
    .filter(Boolean)
    .reduce(
      (best, targetToken) =>
        Math.max(best, getOpenFileSimilarity(queryToken, targetToken)),
      0
    );
}

export function getOpenFileSimilarity(left: string, right: string): number {
  const first = left.trim();
  const second = right.trim();

  if (!first || !second) {
    return 0;
  }

  if (first === second) {
    return 1;
  }

  const direct = getNormalizedLevenshteinSimilarity(first, second);
  const firstSkeleton = getConsonantSkeleton(first);
  const secondSkeleton = getConsonantSkeleton(second);
  const skeleton =
    firstSkeleton.length >= 2 && secondSkeleton.length >= 2
      ? getNormalizedLevenshteinSimilarity(firstSkeleton, secondSkeleton)
      : 0;

  return Math.max(direct, skeleton);
}

export function getConsonantSkeleton(value: string): string {
  return value.replace(/[aeiouyаеёиоуыэюя\s_-]+/giu, "");
}

export function getNormalizedLevenshteinSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);

  if (!maxLength) {
    return 1;
  }

  return 1 - levenshteinDistance(left, right) / maxLength;
}

export function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length] ?? 0;
}

export function shouldRouteThroughSemanticIntentRouter(
  commandText: string,
  effectiveCommandText: string,
  createCommandText: string | null
): boolean {
  if (createCommandText) {
    return true;
  }

  return (
    isBareOpenFileCorrection(commandText) ||
    isBareOpenFileCorrection(effectiveCommandText) ||
    shouldTrySemanticLocalCommand(commandText) ||
    shouldTrySemanticLocalCommand(effectiveCommandText) ||
    hasLocalCommandActionMarker(commandText) ||
    hasLocalCommandActionMarker(effectiveCommandText)
  );
}

export function shouldTrySemanticLocalCommand(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (!normalized) {
    return false;
  }

  const actionMarkers = [
    "помен",
    "замен",
    "измен",
    "исправ",
    "убери",
    "удали",
    "поставь",
    "вставь",
    "перепиши",
    "открой",
    "открыть",
    "покажи",
    "найди",
    "поищи",
    "эта заметка",
    "эту заметку",
    "этот файл",
    "найденн",
    "open",
    "replace",
    "change",
    "search",
    "create",
    "note",
    "\u0441\u043e\u0437\u0434\u0430",
    "\u0437\u0430\u043c\u0435\u0442\u043a",
    "\u043d\u043e\u0443\u0442",
    "\u0430\u043a\u0442\u0443\u0430\u043b",
    "\u0443\u0441\u0442\u0430\u0440",
    "\u043f\u0440\u043e\u0432\u0435\u0440",
    "web",
    "internet",
    "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442",
    "\u0432\u0435\u0431"
  ];

  return actionMarkers.some((marker) => normalized.includes(marker));
}

export function shouldPreventLocalCommandChatFallback(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (!normalized || isQuestionAboutLocalCommand(normalized)) {
    return false;
  }

  return hasLocalCommandActionMarker(commandText);
}

export function isQuestionAboutLocalCommand(normalizedText: string): boolean {
  return (
    normalizedText.startsWith("как ") ||
    normalizedText.startsWith("зачем ") ||
    normalizedText.startsWith("почему ") ||
    normalizedText.startsWith("что значит ") ||
    normalizedText.startsWith("можно ли ") ||
    normalizedText.startsWith("how ") ||
    normalizedText.startsWith("why ") ||
    normalizedText.startsWith("what is ") ||
    normalizedText.startsWith("can i ") ||
    normalizedText.startsWith("can you explain")
  );
}

export function parseSemanticLocalCommand(
  response: string
): SemanticLocalCommand | null {
  const cleaned = cleanJsonLikeResponse(response);

  try {
    const parsed = JSON.parse(cleaned) as Partial<SemanticLocalCommand>;
    const action = parsed.action;

    if (!isSemanticLocalAction(action)) {
      return null;
    }

    return {
      action,
      original:
        typeof parsed.original === "string"
          ? cleanVoiceReplacementText(parsed.original)
          : undefined,
      suggested:
        typeof parsed.suggested === "string"
          ? cleanSuggestedReplacement(parsed.suggested)
          : undefined,
      query:
        typeof parsed.query === "string"
          ? cleanVoiceSearchQuery(parsed.query)
          : undefined,
      replacements: Array.isArray(parsed.replacements)
        ? parsed.replacements
            .map((replacement) => ({
              original:
                typeof replacement?.original === "string"
                  ? cleanVoiceReplacementText(replacement.original)
                  : "",
              suggested:
                typeof replacement?.suggested === "string"
                  ? cleanSuggestedReplacement(replacement.suggested)
                  : ""
            }))
            .filter((replacement) =>
              Boolean(replacement.original && replacement.suggested)
            )
        : undefined
    };
  } catch {
    return null;
  }
}

export function isSemanticLocalAction(
  action: unknown
): action is SemanticLocalCommand["action"] {
  return (
    action === "replace_text" ||
    action === "replace_selection" ||
    action === "open_file" ||
    action === "open_last_file" ||
    action === "search_vault" ||
    action === "semantic_vault" ||
    action === "research_web" ||
    action === "research_note" ||
    action === "create_note" ||
    action === "update_note" ||
    action === "read_last_answer" ||
    action === "stop_speaking" ||
    action === "none"
  );
}

export function findMarkdownPathsInText(text: string, files: TFile[]): string[] {
  const lowerText = text.toLowerCase();
  const directPaths = files
    .filter((file) => lowerText.includes(file.path.toLowerCase()))
    .map((file) => file.path);

  if (directPaths.length) {
    return directPaths;
  }

  const regexPaths = Array.from(
    text.matchAll(/(?:^|\s|`|\[\[)([^`\]\n]+?\.md)(?=$|\s|`|\]\]|[.,;:!?])/gi)
  )
    .map((match) => match[1]?.trim())
    .filter((path): path is string => Boolean(path));

  return regexPaths
    .map((path) => files.find((file) => file.path.toLowerCase() === path.toLowerCase())?.path)
    .filter((path): path is string => Boolean(path));
}

export function parseVoiceVaultSearchQuery(commandText: string): string | null {
  const patterns = [
    /^(?:где\s+я\s+(?:писал|писала|упоминал|упоминала)\s+(?:про|о|об)?|найди\s+(?:мне\s+)?(?:заметк[ауи]\s+)?(?:про|о|об)?|поищи\s+(?:мне\s+)?(?:в\s+vault\s+)?(?:про|о|об)?|поиск\s+(?:по\s+vault\s+)?|найти\s+(?:про|о|об)?)\s+(.+)$/i,
    /^(?:where\s+did\s+i\s+write\s+about|find\s+(?:notes?\s+about)?|search\s+(?:vault\s+for)?)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);
    const query = match?.[1] ? cleanVoiceSearchQuery(match[1]) : "";

    if (query) {
      return query;
    }
  }

  return null;
}

export function parseVoiceWebResearchQuery(commandText: string): string | null {
  const patterns = [
    /^(?:\u043d\u0430\u0439\u0434\u0438|\u043f\u043e\u0438\u0449\u0438|\u0438\u0441\u0441\u043b\u0435\u0434\u0443\u0439)\s+(?:\u043c\u043d\u0435\s+)?(?:\u0432\s+)?(?:\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0435|\u0432\u0435\u0431\u0435|web|internet)\s+(.+)$/i,
    /^(?:\u043f\u043e\u0438\u0441\u043a|\u0440\u0435\u0441\u0435\u0440\u0447|\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435)\s+(?:\u0432\s+)?(?:web|\u0432\u0435\u0431\u0435|\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0435)\s+(.+)$/i,
    /^(?:web\s+search|research\s+web|search\s+the\s+web\s+for|look\s+up)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);
    const query = match?.[1] ? cleanVoiceSearchQuery(match[1]) : "";

    if (query) {
      return query;
    }
  }

  return null;
}

export function parseVoiceSemanticVaultQuery(commandText: string): string | null {
  const patterns = [
    /^(?:\u0441\u043f\u0440\u043e\u0441\u0438|\u043e\u0442\u0432\u0435\u0442\u044c|\u043d\u0430\u0439\u0434\u0438|\u043f\u043e\u0438\u0449\u0438)\s+(?:\u043f\u043e\s+)?(?:\u0432\u0441\u0435\u043c\u0443\s+)?(?:vault|\u0432\u043e\u043b\u0442\u0443|\u0445\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0443)\s+(.+)$/i,
    /^(?:semantic\s+search|semantic\s+vault|rag|ask\s+vault)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = commandText.match(pattern);
    const query = match?.[1] ? cleanVoiceSearchQuery(match[1]) : "";

    if (query) {
      return query;
    }
  }

  return null;
}

export function parseVoiceMemoryIntent(commandText: string): VoiceMemoryIntent | null {
  const normalized = normalizeVoiceCommandText(commandText);

  if (
    normalized.includes("что там кратко") ||
    (normalized.includes("что там") && normalized.includes("кратко")) ||
    (normalized.includes("там") && normalized.includes("опис")) ||
    normalized.includes("кратко там") ||
    normalized.includes("что в этом файле") ||
    normalized.includes("объясни этот файл") ||
    normalized.includes("расскажи кратко") ||
    normalized === "summarize it" ||
    normalized === "summarize that file"
  ) {
    return "summarize-last-file";
  }

  if (
    normalized.includes("открой его") ||
    normalized.includes("можешь его открыть") ||
    normalized.includes("можешь открыть его") ||
    normalized.includes("можешь открыть этот") ||
    normalized.includes("открой заметку") ||
    normalized.includes("открой ноус") ||
    normalized.includes("открой этот файл") ||
    normalized.includes("открой найденный файл") ||
    normalized === "open it" ||
    normalized === "open that file"
  ) {
    return "open-last-file";
  }

  if (
    normalized.includes("используй найденное") ||
    normalized.includes("добавь найденное в контекст") ||
    normalized.includes("прикрепи найденное") ||
    normalized === "use those results" ||
    normalized === "attach those results"
  ) {
    return "attach-last-results";
  }

  return null;
}

export function parseVoiceNoteAction(commandText: string): VoiceNoteAction | null {
  const normalized = normalizeVoiceCommandText(commandText);

  if (
    normalized.includes("запомни это") ||
    normalized.includes("запомни текущую заметку") ||
    normalized.includes("remember this") ||
    normalized.includes("remember note")
  ) {
    return "remember";
  }

  if (
    normalized.includes("создай roadmap") ||
    normalized.includes("создай роадмап") ||
    normalized.includes("сделай roadmap") ||
    normalized.includes("сделай роадмап") ||
    normalized.includes("create roadmap")
  ) {
    return "roadmap";
  }

  if (
    normalized.includes("обнови текущую заметку") ||
    normalized.includes("обнови note") ||
    normalized.includes("обнови заметку") ||
    normalized.includes("\u043f\u0440\u043e\u0432\u0435\u0440\u044c \u0430\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c") ||
    (normalized.includes("\u043f\u0440\u043e\u0432\u0435\u0440") &&
      normalized.includes("\u0443\u0441\u0442\u0430\u0440")) ||
    (normalized.includes("\u043f\u0440\u043e\u0432\u0435\u0440") &&
      normalized.includes("\u0437\u0430\u043c\u0435\u0442")) ||
    normalized.includes("\u0430\u043a\u0442\u0443\u0430\u043b\u0438\u0437") ||
    normalized.includes("\u0441\u0434\u0435\u043b\u0430\u0439 \u0430\u043a\u0442\u0443\u0430\u043b") ||
    normalized.includes("\u043e\u0431\u043d\u043e\u0432\u0438 \u0441 \u0443\u0447\u0435\u0442\u043e\u043c") ||
    normalized.includes("\u043e\u0431\u043d\u043e\u0432\u0438 \u0443\u0447\u0438\u0442\u044b\u0432\u0430\u044f") ||
    normalized.includes("refresh note") ||
    normalized.includes("make note current") ||
    normalized.includes("make it up to date") ||
    normalized.includes("update note")
  ) {
    return "update-note";
  }

  if (
    normalized.includes("\u0441\u043e\u0445\u0440\u0430\u043d\u0438 \u0447\u0430\u0442") ||
    normalized.includes("\u0447\u0430\u0442 \u0432 \u0437\u0430\u043c\u0435\u0442\u043a\u0443") ||
    normalized.includes("\u0437\u0430\u043c\u0435\u0442\u043a\u0443 \u0438\u0437 \u0447\u0430\u0442\u0430") ||
    normalized.includes("turn chat into note") ||
    normalized.includes("save chat")
  ) {
    return "chat-note";
  }

  return null;
}

export function normalizeVoiceCommandText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()[\]{}"'«»“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasLlmRequestContext(context: LlmRequestContext): boolean {
  return Boolean(
    context.currentNote ||
      context.selectedText ||
      context.vaultResults?.length ||
      context.projectMemory?.trim() ||
      context.attachments?.length ||
      context.webResults?.length ||
      context.liveDialogue
  );
}

export function inferCurrentNoteReplacementTarget(content: string): string | null {
  const meaningfulLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^---+$/.test(line));

  if (meaningfulLines.length === 1) {
    return meaningfulLines[0];
  }

  if (meaningfulLines.length <= 3) {
    return meaningfulLines[meaningfulLines.length - 1] ?? null;
  }

  return null;
}

export function countOccurrences(content: string, search: string): number {
  if (!search) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (index !== -1) {
    index = content.indexOf(search, index);

    if (index !== -1) {
      count += 1;
      index += search.length;
    }
  }

  return count;
}

export function getUniqueOccurrenceIndex(content: string, search: string): number | undefined {
  return countOccurrences(content, search) === 1 ? 0 : undefined;
}

export function findUniqueTextOccurrence(
  content: string,
  requestedText: string
): { match: TextOccurrenceMatch; error: null } | { match: null; error: string } {
  return findUniqueTextOccurrenceInContent(content, requestedText);
}

export function findFlexibleWhitespaceMatches(
  content: string,
  requestedText: string
): string[] {
  const pattern = requestedText
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");

  if (!pattern) {
    return [];
  }

  const matches: string[] = [];
  const regex = new RegExp(pattern, "giu");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match[0]) {
      matches.push(match[0]);
    }
  }

  return Array.from(new Set(matches));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceSelectedOccurrence(
  content: string,
  search: string,
  replacement: string,
  occurrenceIndex?: number
): string {
  if (occurrenceIndex !== undefined) {
    return replaceNthOccurrence(content, search, replacement, occurrenceIndex);
  }

  const occurrenceCount = countOccurrences(content, search);

  if (occurrenceCount === 0) {
    throw new Error(
      "Original selected text was not found in the source note. The note may have changed."
    );
  }

  if (occurrenceCount > 1) {
    throw new Error(
      "Original selected text appears more than once. Select a more specific passage before applying."
    );
  }

  return content.replace(search, replacement);
}

export function replaceNthOccurrence(
  content: string,
  search: string,
  replacement: string,
  occurrenceIndex: number
): string {
  if (!search) {
    throw new Error("Original selected text is empty.");
  }

  let found = -1;
  let cursor = 0;

  for (let index = 0; index <= occurrenceIndex; index += 1) {
    found = content.indexOf(search, cursor);

    if (found === -1) {
      throw new Error(
        "Original selected text was not found at its recorded position. The note may have changed."
      );
    }

    cursor = found + search.length;
  }

  return `${content.slice(0, found)}${replacement}${content.slice(
    found + search.length
  )}`;
}
