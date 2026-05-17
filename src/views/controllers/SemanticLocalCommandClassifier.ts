import type { App, TFile } from "obsidian";
import type { ChatMessage, ContexSettings } from "../../types";
import {
  parseSemanticLocalCommandPlan,
  type SemanticLocalCommand
} from "../semanticLocalCommandPlan";
import { buildToolRouterPrompt } from "../../router/toolRouterPrompt";
import { collectVaultCandidates } from "../../router/vaultCandidates";
import { buildVaultCandidatePromptContextDataFromPaths } from "../../router/vaultCandidatePromptContext";
import { buildSemanticLocalCommandPrompt } from "../../router/semanticLocalCommandPrompt";
import { decideVaultActionCandidate } from "../../router/vaultActionDecision";
import type { VaultCandidate } from "../../router/vaultCandidates";

export interface SemanticLocalCommandClassifierDeps {
  app: App;
  getSettings: () => ContexSettings;
  readActiveMarkdownNote: () => Promise<{
    file: TFile;
    content: string;
  } | null>;
  findLastMentionedMarkdownPaths: () => string[];
  getLastFoundFilePaths: () => string[];
  requestCompletion: (
    settings: ContexSettings,
    messages: ChatMessage[]
  ) => Promise<string>;
}

export class SemanticLocalCommandClassifier {
  constructor(private readonly deps: SemanticLocalCommandClassifierDeps) {}

  async classifyFirst(
    commandText: string,
    effectiveCommandText?: string
  ): Promise<SemanticLocalCommand | null> {
    const commands = await this.classifyPlan(commandText, effectiveCommandText);

    return commands?.[0] ?? null;
  }

  async classifyPlan(
    commandText: string,
    effectiveCommandText?: string
  ): Promise<SemanticLocalCommand[] | null> {
    const note = await this.deps.readActiveMarkdownNote();
    const mentionedPaths = this.deps.findLastMentionedMarkdownPaths().slice(0, 5);
    const lastResultPaths = this.deps.getLastFoundFilePaths().slice(0, 6);
    const routerUserText =
      effectiveCommandText && effectiveCommandText !== commandText
        ? `${commandText}\nCorrected/latest command segment: ${effectiveCommandText}`
        : commandText;
    const routerCandidates = collectVaultCandidates(
      this.deps.app,
      routerUserText,
      24
    );
    const toolRouterContext = buildToolRouterPrompt({
      userText: routerUserText,
      activeNotePath: note?.file.path ?? null,
      candidates: routerCandidates
    });
    const vaultCandidatePromptContext =
      buildVaultCandidatePromptContextDataFromPaths(
        this.deps.app.vault.getMarkdownFiles().map((file) => file.path),
        commandText,
        effectiveCommandText,
        [
          note?.file.path ?? "",
          ...mentionedPaths,
          ...lastResultPaths
        ].filter(Boolean)
      );
    const prompt = buildSemanticLocalCommandPrompt({
      commandText,
      effectiveCommandText,
      activeNotePath: note?.file.path ?? null,
      activeNoteExcerpt: note?.content.slice(0, 4000) ?? "",
      mentionedPaths,
      lastResultPaths,
      toolRouterContext,
      vaultCandidateContext: vaultCandidatePromptContext.text
    });
    const response = await this.deps.requestCompletion(this.deps.getSettings(), [
      {
        id: `${Date.now()}-semantic-local-command`,
        role: "user",
        content: prompt,
        createdAt: Date.now()
      }
    ]);

    const commands = parseSemanticLocalCommandPlan(response);

    return commands
      ? applyVaultActionDecisions(
          commands,
          mergeVaultCandidates(
            routerCandidates,
            vaultCandidatePromptContext.selectableFileCandidates
          )
        )
      : null;
  }
}

function mergeVaultCandidates(
  primaryCandidates: VaultCandidate[],
  secondaryCandidates: VaultCandidate[]
): VaultCandidate[] {
  const byPath = new Map<string, VaultCandidate>();

  for (const candidate of [...primaryCandidates, ...secondaryCandidates]) {
    const existing = byPath.get(candidate.path);

    if (!existing || candidate.score > existing.score) {
      byPath.set(candidate.path, candidate);
    }
  }

  return Array.from(byPath.values());
}

function applyVaultActionDecisions(
  commands: SemanticLocalCommand[],
  routerCandidates: VaultCandidate[]
): SemanticLocalCommand[] | null {
  const resolvedCommands: SemanticLocalCommand[] = [];

  for (const command of commands) {
    if (command.action !== "open_file") {
      resolvedCommands.push(command);
      continue;
    }

    const decision = decideVaultActionCandidate({
      candidates: routerCandidates,
      llmCandidatePath: command.candidatePath ?? command.query
    });

    if (decision.kind !== "direct") {
      return null;
    }

    resolvedCommands.push({
      ...command,
      query: decision.path,
      candidatePath: decision.path
    });
  }

  return resolvedCommands.length ? resolvedCommands : null;
}
