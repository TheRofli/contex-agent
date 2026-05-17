export interface SemanticVoiceTextReplacement {
  original: string;
  suggested: string;
}

export type SemanticLocalCommandAction =
  | "replace_text"
  | "replace_selection"
  | "open_file"
  | "open_last_file"
  | "search_vault"
  | "semantic_vault"
  | "research_web"
  | "research_note"
  | "create_note"
  | "update_note"
  | "read_last_answer"
  | "stop_speaking"
  | "none";

export interface SemanticLocalCommand {
  action: SemanticLocalCommandAction;
  original?: string;
  suggested?: string;
  query?: string;
  candidatePath?: string;
  replacements?: SemanticVoiceTextReplacement[];
}

interface SemanticLocalCommandPlanResponse {
  actions?: unknown[];
  action?: unknown;
}

export function parseSemanticLocalCommandPlan(
  response: string
): SemanticLocalCommand[] | null {
  const cleaned = cleanJsonLikeResponse(response);

  try {
    const parsed = JSON.parse(cleaned) as SemanticLocalCommandPlanResponse;
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [parsed];
    const actions = rawActions
      .map(parseSemanticLocalCommandObject)
      .filter((action): action is SemanticLocalCommand =>
        Boolean(action && action.action !== "none")
      )
      .slice(0, 5);

    return actions.length ? actions : null;
  } catch {
    return null;
  }
}

function parseSemanticLocalCommandObject(
  value: unknown
): SemanticLocalCommand | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<SemanticLocalCommand>;

  if (!isSemanticLocalAction(parsed.action)) {
    return null;
  }

  return {
    action: parsed.action,
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
    candidatePath:
      typeof parsed.candidatePath === "string"
        ? cleanVoiceSearchQuery(parsed.candidatePath)
        : undefined,
    replacements: Array.isArray(parsed.replacements)
      ? parsed.replacements
          .map((replacement) => {
            const candidate = replacement as Partial<SemanticVoiceTextReplacement>;

            return {
              original:
                typeof candidate?.original === "string"
                  ? cleanVoiceReplacementText(candidate.original)
                  : "",
              suggested:
                typeof candidate?.suggested === "string"
                  ? cleanSuggestedReplacement(candidate.suggested)
                  : ""
            };
          })
          .filter((replacement) =>
            Boolean(replacement.original && replacement.suggested)
          )
      : undefined
  };
}

function cleanSuggestedReplacement(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);

  return (fenceMatch?.[1] ?? trimmed).trim();
}

function cleanJsonLikeResponse(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function cleanVoiceReplacementText(text: string): string {
  return stripOuterQuotes(text)
    .replace(/\s+/g, " ")
    .trim();
}

function cleanVoiceSearchQuery(text: string): string {
  return stripOuterQuotes(text)
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function stripOuterQuotes(value: string): string {
  return value
    .trim()
    .replace(/^[`"'“”«»]+/, "")
    .replace(/[`"'“”«»]+$/, "")
    .trim();
}

function isSemanticLocalAction(
  action: unknown
): action is SemanticLocalCommandAction {
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
