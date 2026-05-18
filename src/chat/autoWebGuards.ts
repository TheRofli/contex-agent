export function isVaultLocalDescriptionRequest(userRequest: string): boolean {
  const normalized = normalizeRequestText(userRequest);

  if (!normalized || hasExplicitWebIntent(normalized)) {
    return false;
  }

  const explicitLocalTarget = includesAny(normalized, [
    "открыт",
    "текущ",
    "этот файл",
    "эту заметку",
    "заметк",
    "файл",
    "путь",
    "активн",
    "мой vault",
    "моем vault",
    "моём vault",
    "в vault",
    "из vault",
    "в хранилище",
    "из хранилища",
    "my vault",
    "in my vault",
    "from my vault"
  ]) || includesAnyLocalPhrase(normalized, [
    "current note",
    "this note",
    "open note",
    "opened note",
    "this file",
    "file path",
    "open file",
    "opened file",
    "active note"
  ]);
  const genericLocalTarget =
    hasLocalAnchor(normalized) &&
    includesAnyWord(normalized, ["file", "files", "note", "notes", "path", "vault"]);
  const localTarget = explicitLocalTarget || genericLocalTarget;
  const descriptionIntent = includesAny(normalized, [
    "опиши",
    "описать",
    "объясни",
    "объяснить",
    "о чем",
    "о чём",
    "что это",
    "найди",
    "найти",
    "покажи",
    "открой",
    "summarize",
    "describe",
    "explain",
    "what is this",
    "what is in",
    "what's in",
    "tell me about",
    "find",
    "read",
    "search",
    "show",
    "open"
  ]);

  return localTarget && descriptionIntent;
}

export function hasExplicitWebIntent(userRequest: string): boolean {
  const normalized = normalizeRequestText(userRequest);

  return includesAnyPhrase(normalized, [
    "в интернете",
    "в вебе",
    "поиск в сети",
    "поищи в интернете",
    "загугли",
    "гугл",
    "search the internet",
    "internet search",
    "internet research",
    "internet sources",
    "internet source",
    "use the internet",
    "using the internet",
    "use internet",
    "online search",
    "online research",
    "online sources",
    "online source",
    "using online sources",
    "search the web",
    "use the web",
    "using the web",
    "web search",
    "web research",
    "web sources",
    "web source",
    "google"
  ]);
}

export function normalizeRequestText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function includesAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
  });
}

function includesAnyLocalPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b(?!-)`, "u").test(text);
  });
}

function includesAnyWord(text: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b(?!-)`, "u").test(text));
}

function hasLocalAnchor(text: string): boolean {
  return includesAny(text, [
    "current",
    "this",
    "open",
    "opened",
    "active",
    "vault",
    "хранилищ",
    "текущ",
    "открыт",
    "активн"
  ]);
}
