import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const styles = readFileSync(join(process.cwd(), "styles.css"), "utf8");
const sidebarView = readFileSync(
  join(process.cwd(), "src", "views", "AgentSidebarView.ts"),
  "utf8"
);
const uiSourceFiles = [
  ...listSourceFiles(join(process.cwd(), "src", "views")),
  ...listSourceFiles(join(process.cwd(), "src", "modals")),
  ...listSourceFiles(join(process.cwd(), "src", "diagnostics"))
];

assert.ok(!styles.includes("var(--color-orange"));
assert.ok(
  /\.contex-agent__auto-apply-toggle\.is-active\s*\{[^}]*var\(--mindo-accent\)/s.test(
    styles
  )
);
assert.ok(
  /\.contex-agent__auto-apply-toggle\.is-active \.contex-agent__auto-apply-knob\s*\{[^}]*background:\s*var\(--mindo-accent\);/s.test(
    styles
  )
);
assert.ok(styles.includes(".contex-agent__action-menu-item-icon"));
assert.ok(styles.includes(".contex-agent__action-menu-item-label"));
assert.ok(sidebarView.includes("icon:"));
assert.ok(sidebarView.includes("contex-agent__action-menu-item-icon"));
assert.ok(sidebarView.includes("contex-agent__action-menu-item-label"));
assert.ok(sidebarView.includes("removeAttribute(\"title\")"));
assert.ok(!sidebarView.includes('title: this.t("startLiveDialogue")'));
assert.deepEqual(findNativeTooltipTitleAttributes(uiSourceFiles), []);
assert.ok(
  /private\s+async\s+renderLiveDialogueTranscript[\s\S]*MarkdownRenderer\.render/s.test(
    sidebarView
  ),
  "Expected live dialogue transcript to render assistant Markdown instead of showing raw markdown markers."
);
assert.ok(
  styles.includes("contex-agent__message--assistant") &&
    /\.contex-agent__message\s*\{[^}]*border:\s*2px solid var\(--mindo-ink\)/s.test(
      styles
    ),
  "Expected normal chat messages to use the same soft drawn bubble style as live dialogue."
);
assert.ok(
  /\.contex-agent__message-content\.markdown-rendered[\s\S]*color:\s*#16131c;/s.test(
    styles
  ) &&
    /\.contex-agent__live-transcript-text\.markdown-rendered[\s\S]*color:\s*#16131c;/s.test(
      styles
    ),
  "Expected rendered Markdown inside chat and live dialogue bubbles to stay dark on the light bubble background."
);
assert.ok(!styles.includes("!important"), "Expected Mindo styles to avoid !important overrides.");
assert.ok(!styles.includes("text-decoration"), "Expected Mindo styles to avoid partially supported text-decoration.");
assert.ok(
  sidebarView.includes(
    'import { OpenFileCommandController } from "./controllers/OpenFileCommandController";'
  ),
  "Expected AgentSidebarView to import the open-file command controller."
);
assert.ok(
  isOpenFileRoutingDelegated(sidebarView),
  "Expected AgentSidebarView.openFileByVaultQuery to delegate open-file routing to OpenFileCommandController."
);
assert.ok(
  isOpenFileCandidateDecisionBased(sidebarView),
  "Expected AgentSidebarView.resolveOpenFileCandidate to return files only for direct resolver decisions."
);
assert.ok(
  isAutoWebContextGuardedBeforePlannerFallback(sidebarView),
  "Expected AgentSidebarView.buildAutoWebContextForRequest to skip vault-local prompts before planner fallback."
);
assert.ok(
  isSidebarExplicitWebIntentPhraseBased(sidebarView),
  "Expected AgentSidebarView.decideAutoWebResearch explicit web intent to avoid bare topical 'web'."
);
assert.ok(
  isResearchWorkflowGuardedBeforeKeywordFallback(sidebarView),
  "Expected AgentSidebarView.buildResearchWorkflowWebContext to skip vault-local prompts before research keyword fallback."
);
assert.ok(
  isResearchWorkflowWebKeywordConservative(sidebarView),
  "Expected shouldUseWebForResearchWorkflow to avoid bare topical 'web'."
);
assert.ok(
  isStarterPromptEmptyStateWired(sidebarView),
  "Expected AgentSidebarView.renderSuggestions to delegate first-value starter prompt cards to SuggestionCardsRenderer."
);
assert.ok(
  isUpdateCurrentNoteActionPromptForwarded(sidebarView),
  "Expected AgentSidebarView.runNoteAction to pass update-current-note action prompts into updateCurrentNote."
);

console.log("mindoUiPolish tests passed");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return listSourceFiles(path);
      }

      return entry.endsWith(".ts") ? [path] : [];
    })
    .sort();
}

function findNativeTooltipTitleAttributes(files: string[]): string[] {
  const failures: string[] = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/u);
    let attrDepth = 0;

    lines.forEach((line, index) => {
      if (/setAttribute\(\s*["']title["']/u.test(line)) {
        failures.push(formatFailure(file, index, line));
      }

      if (/\battr\s*:\s*\{/u.test(line)) {
        attrDepth += countBraces(line.slice(line.indexOf("attr")));
      } else if (attrDepth > 0) {
        attrDepth += countBraces(line);
      }

      if (attrDepth > 0 && /^\s*title\s*:/u.test(line)) {
        failures.push(formatFailure(file, index, line));
      }

      if (attrDepth < 0) {
        attrDepth = 0;
      }
    });
  }

  return failures;
}

function countBraces(line: string): number {
  return [...line].reduce((depth, char) => {
    if (char === "{") {
      return depth + 1;
    }

    if (char === "}") {
      return depth - 1;
    }

    return depth;
  }, 0);
}

function formatFailure(file: string, index: number, line: string): string {
  return `${file}:${index + 1}: ${line.trim()}`;
}

function isOpenFileRoutingDelegated(source: string): boolean {
  const method = source.match(
    /private async openFileByVaultQuery[\s\S]*?private resolveOpenFileCandidate/u
  )?.[0];

  if (!method) {
    return false;
  }

  return (
    method.includes("new OpenFileCommandController") &&
    method.includes("resolveDirectCandidate") &&
    method.includes("this.resolveOpenFileCandidate(candidateQuery)") &&
    method.includes("resolvePathsWithRustCore") &&
    method.includes("return controller.openFileByVaultQuery(query, commandText)")
  );
}

function isOpenFileCandidateDecisionBased(source: string): boolean {
  const method = source.match(
    /private resolveOpenFileCandidate[\s\S]*?private async openVaultPath/u
  )?.[0];

  if (!method) {
    return false;
  }

  return (
    source.includes("resolveOpenFileTarget") &&
    !source.includes("rankOpenFilePathCandidates") &&
    method.includes("const decision = resolveOpenFileTarget") &&
    method.includes("currentPath: this.voiceSessionMemory.lastOpenedFile") &&
    method.includes('if (decision.kind !== "direct")') &&
    method.includes("decision.candidate.path")
  );
}

function isAutoWebContextGuardedBeforePlannerFallback(source: string): boolean {
  const method = source.match(
    /private async buildAutoWebContextForRequest[\s\S]*?private async attachProjectMemoryContext/u
  )?.[0];

  if (!method) {
    return false;
  }

  const localOnlyIndex = method.indexOf("isLocalOnlyCommandText(userRequest)");
  const vaultLocalIndex = method.indexOf("isVaultLocalDescriptionRequest(userRequest)");
  const plannerIndex = method.indexOf("planContextWorkflow(userRequest)");

  return (
    localOnlyIndex >= 0 &&
    vaultLocalIndex > localOnlyIndex &&
    plannerIndex > vaultLocalIndex
  );
}

function isSidebarExplicitWebIntentPhraseBased(source: string): boolean {
  const method = source.match(
    /function decideAutoWebResearch[\s\S]*?function buildAutoWebResearchQuery/u
  )?.[0];

  if (!method) {
    return false;
  }

  return (
    method.includes("const explicitWeb = hasExplicitWebIntent(userRequest);") &&
    !method.includes('"web"')
  );
}

function isResearchWorkflowGuardedBeforeKeywordFallback(source: string): boolean {
  const method = source.match(
    /private async buildResearchWorkflowWebContext[\s\S]*?private async prepareResearchNoteProposal/u
  )?.[0];

  if (!method) {
    return false;
  }

  const autoWebIndex = method.indexOf("this.buildAutoWebContextForRequest");
  const vaultLocalIndex = method.indexOf("isVaultLocalDescriptionRequest(commandText)");
  const fallbackIndex = method.indexOf("shouldUseWebForResearchWorkflow(commandText)");

  return (
    autoWebIndex >= 0 &&
    vaultLocalIndex > autoWebIndex &&
    fallbackIndex > vaultLocalIndex
  );
}

function isResearchWorkflowWebKeywordConservative(source: string): boolean {
  const method = source.match(
    /function shouldUseWebForResearchWorkflow[\s\S]*?function sanitizeResearchTitle/u
  )?.[0];

  if (!method) {
    return false;
  }

  return (
    method.includes("hasExplicitWebIntent(commandText)") &&
    !method.includes('"web"')
  );
}

function isStarterPromptEmptyStateWired(source: string): boolean {
  const method = source.match(
    /private renderSuggestions\(\): void[\s\S]*?private refreshConversationChrome/u
  )?.[0];

  if (!method) {
    return false;
  }

  const hiddenIndex = method.indexOf("contex-agent__suggestions--hidden");
  const heroIndex = method.indexOf("renderHomeHero");
  const rendererIndex = method.indexOf("new SuggestionCardsRenderer");
  const renderIndex = method.indexOf("renderer.render");

  return (
    source.includes(
      'import { SuggestionCardsRenderer } from "./suggestionCardsRenderer";'
    ) &&
    !source.includes(
      'import { getSuggestionCards } from "./suggestionCardsRenderer";'
    ) &&
    hiddenIndex >= 0 &&
    heroIndex > hiddenIndex &&
    rendererIndex > heroIndex &&
    renderIndex > rendererIndex &&
    method.includes("getUiLanguage: () => this.getUiLanguage()") &&
    method.includes("t: (key) => this.t(key)") &&
    method.includes("runNoteAction: (action) => this.runNoteAction(action)") &&
    method.includes("setIcon: (element, icon) => setIcon(element, icon)") &&
    method.includes("this.noteActionButtons = renderer.render") &&
    method.includes("messages: this.messages") &&
    method.includes("noteActionButtons: this.noteActionButtons")
  );
}

function isUpdateCurrentNoteActionPromptForwarded(source: string): boolean {
  const method = source.match(
    /private async runNoteAction\(action: NoteAction\): Promise<void>[\s\S]*?private renderModelMenu/u
  )?.[0];

  if (!method) {
    return false;
  }

  return (
    source.includes(
      'async updateCurrentNote(userPrompt = "Update the current note safely."): Promise<void>'
    ) &&
    method.includes('if (action.kind === "update-current-note")') &&
    method.includes("await this.updateCurrentNote(action.prompt);")
  );
}
