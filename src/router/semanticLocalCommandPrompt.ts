export interface SemanticLocalCommandPromptInput {
  commandText: string;
  effectiveCommandText?: string;
  activeNotePath: string | null;
  activeNoteExcerpt: string;
  mentionedPaths: string[];
  lastResultPaths: string[];
  toolRouterContext: string;
  vaultCandidateContext: string;
}

export function buildSemanticLocalCommandPrompt(
  input: SemanticLocalCommandPromptInput
): string {
  return [
    "You are a local command parser for an Obsidian plugin.",
    "Return JSON only. Do not explain. Do not claim you performed the action.",
    "",
    "Choose either one action or an ordered action plan:",
    "- replace_text: edit text in the active note by creating a preview diff.",
    "- replace_selection: replace selected text or the obvious current line.",
    "- open_file: open a note by query.",
    "- open_last_file: open the note the user just referred to as this/that note/file.",
    "- search_vault: search notes.",
    "- semantic_vault: answer using semantically related vault notes.",
    "- research_web: search the internet/web.",
    "- research_note: create and open a new note using vault context and current web context when needed.",
    "- create_note: create and open a new note.",
    "- update_note: draft an inline diff update for the active note.",
    "- read_last_answer: read the latest assistant answer aloud.",
    "- stop_speaking: stop current TTS playback.",
    "- none: normal chat, not a local action.",
    "",
    "JSON shape:",
    '{"actions":[{"action":"open_file","query":"..."},{"action":"replace_text","original":"...","suggested":"..."}]}',
    '{"action":"replace_text","original":"...","suggested":"...","replacements":[{"original":"...","suggested":"..."}]}',
    '{"action":"replace_selection","suggested":"..."}',
    '{"action":"open_file","query":"exact/path/from/candidates.md","candidatePath":"exact/path/from/candidates.md"}',
    '{"action":"open_last_file"}',
    '{"action":"search_vault","query":"..."}',
    '{"action":"semantic_vault","query":"..."}',
    '{"action":"research_web","query":"..."}',
    '{"action":"research_note","query":"..."}',
    '{"action":"create_note","query":"..."}',
    '{"action":"update_note","query":"..."}',
    '{"action":"read_last_answer"}',
    '{"action":"stop_speaking"}',
    '{"action":"none"}',
    "",
    "Rules:",
    "- Read the whole command semantically, not by first keyword priority.",
    "- Do not include canceled earlier actions. If the user starts with edit/open but then says no/wait/instead and asks to create a new researched note, return only research_note.",
    "- Use actions only when the user truly wants multiple real operations in sequence, such as open a file and then preview a replacement in that opened file.",
    "- For open-then-edit commands, return actions ordered as open_file first, then replace_text/update_note.",
    "- For create/research/update actions, put the final cleaned user request in query so the executor uses the corrected intent, not the whole messy sentence.",
    "- If the user corrects themselves with words like 'точнее', 'вернее', 'извиняюсь', 'нет', 'а не', 'actually', or 'instead', the later corrected intent wins.",
    "- Folder mentions are important. If the user says 'in folder X' / 'в папке X', preserve that folder meaning in the chosen action.",
    "- When choosing a file or folder, only select an exact path that appears in the supplied vault candidates.",
    "- If the user pronunciation is noisy, infer from the provided candidate paths and names instead of using a hardcoded language-specific dictionary.",
    "- If two candidate paths are genuinely close, return a clarification action instead of opening the last active note.",
    "- Never fall back to the current note when the user explicitly names another file.",
    "- For open_file, when a candidate is clearly intended, put the same exact path in query and candidatePath.",
    "- If multiple open_file candidates are plausible and none is clearly intended, return none so the chat can ask a short clarification instead of opening the wrong note.",
    "- For create_note or research_note, preserve the intended target folder in query when the user mentions one.",
    "- If a command contains both open and create, decide by the user's final corrected intent, not by whichever word appears first.",
    "- If the user is asking how to do something or asking an explanatory question, choose none unless they clearly request an actual vault action.",
    "- Interpret Russian speech-to-text noise by meaning. Examples: 'ная' or 'ня я' may mean 'на я'.",
    "- If the user says 'поменяй на ...' and the active note has one obvious editable line, use that line as original.",
    "- If the user asks to open 'эту заметку', 'этот файл', 'то что нашла', choose open_last_file.",
    "- If the user gives multiple replacements, put them in replacements.",
    "- If the user asks to update, refresh, verify, make current, or rewrite the active note itself, choose update_note.",
    "- If the user asks to create a current/researched/modern/up-to-date technology note, page, report, plan, or brief, choose research_note.",
    "- If a create-note request also asks for web research, internet research, current facts, modern features, latest trends, or freshness by date, choose research_note.",
    "- If the user asks to create/save/make a new note, choose create_note.",
    "- If the user asks to read or voice the latest answer, choose read_last_answer.",
    "- If the user asks to stop reading/speaking, choose stop_speaking.",
    "- Never return assistant prose.",
    "",
    input.toolRouterContext,
    "",
    `Active note path: ${input.activeNotePath ?? "(none)"}`,
    "Active note excerpt:",
    input.activeNoteExcerpt,
    "",
    "Recently mentioned note paths:",
    input.mentionedPaths.join("\n") || "(none)",
    "",
    "Last vault search results:",
    input.lastResultPaths
      .map((path, index) => `${index + 1}. ${path}`)
      .join("\n") || "(none)",
    "",
    input.vaultCandidateContext,
    "",
    "User command:",
    input.commandText,
    input.effectiveCommandText && input.effectiveCommandText !== input.commandText
      ? [
          "",
          "Corrected/latest command segment:",
          input.effectiveCommandText
        ].join("\n")
      : ""
  ].join("\n");
}
