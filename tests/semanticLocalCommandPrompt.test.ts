import { buildSemanticLocalCommandPrompt } from "../src/router/semanticLocalCommandPrompt";

const prompt = buildSemanticLocalCommandPrompt({
  commandText: "Открой тест, точнее создай заметку.",
  effectiveCommandText: "создай заметку.",
  activeNotePath: "Test/Test.md",
  activeNoteExcerpt: "Current note content",
  mentionedPaths: ["Obisidian/Фишки obsidian.md"],
  lastResultPaths: ["lumiq/lumiq.md"],
  toolRouterContext: "Tool router context",
  vaultCandidateContext: "Vault candidate context"
});

if (!prompt.includes("Return JSON only")) {
  throw new Error("Expected JSON-only instruction.");
}

if (!prompt.includes("Corrected/latest command segment:")) {
  throw new Error("Expected corrected command segment.");
}

if (!prompt.includes("Vault candidate context")) {
  throw new Error("Expected vault candidate context.");
}

if (
  !prompt.includes(
    "When choosing a file or folder, only select an exact path that appears in the supplied vault candidates."
  )
) {
  throw new Error("Expected exact vault candidate path rule.");
}

if (
  !prompt.includes(
    "If the user pronunciation is noisy, infer from the provided candidate paths and names instead of using a hardcoded language-specific dictionary."
  )
) {
  throw new Error("Expected noisy pronunciation vault-candidate rule.");
}

if (
  !prompt.includes(
    "Never fall back to the current note when the user explicitly names another file."
  )
) {
  throw new Error("Expected no-current-note-fallback rule.");
}

if (!prompt.includes("Active note path: Test/Test.md")) {
  throw new Error("Expected active note path.");
}

console.log("semanticLocalCommandPrompt tests passed");
