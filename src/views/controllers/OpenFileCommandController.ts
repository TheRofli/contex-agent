import type { ActionTimelineEventType } from "../../actions/actionTimeline";
import {
  resolveOpenFileTarget,
  type OpenFileResolution
} from "../../resolver/openFileResolution";
import type { ActionReceipt, VaultSearchResult } from "../../types";
import { getFolderPath } from "../createNotePathUtils";

type DirectOpenFileCandidate = {
  path: string;
  basename: string;
};

type RustPathResolverResult = {
  path: string;
  score: number;
};

export type OpenFileCommandControllerDeps = {
  getMarkdownPaths: () => string[];
  resolveDirectCandidate: (query: string) => DirectOpenFileCandidate | null;
  resolvePathsWithRustCore: (input: {
    query: string;
    paths: string[];
    limit: number;
    pluginDir: string;
  }) => Promise<RustPathResolverResult[] | null>;
  pluginDir?: string;
  searchSemanticVaultMarkdown: (
    query: string,
    variants: string[],
    limit: number
  ) => Promise<VaultSearchResult[]>;
  openVaultPath: (path: string, noticeMessage: string) => Promise<void>;
  rememberVaultSearch: (query: string, results: VaultSearchResult[]) => void;
  appendActionReceipt: (
    receipt: ActionReceipt,
    userContent?: string
  ) => void;
  pushActionTimeline: (
    type: ActionTimelineEventType,
    label: string,
    detail?: string,
    path?: string
  ) => void;
  setError: (error: string | null) => void;
  setStatus: (status: string) => void;
};

export class OpenFileCommandController {
  constructor(private readonly deps: OpenFileCommandControllerDeps) {}

  async openFileByVaultQuery(
    query: string,
    commandText: string
  ): Promise<string | null> {
    this.deps.pushActionTimeline("opening", "Opening note", query);
    const resolution = await this.resolveQuery(query);

    if (resolution.kind === "none") {
      this.deps.setError(`Could not find a Markdown note for: ${query}`);
      this.deps.setStatus("Status: Open failed");
      this.deps.pushActionTimeline("failed", "Open failed", query);
      return null;
    }

    if (resolution.kind === "clarify") {
      const detail = resolution.candidates
        .map((candidate, index) => `${index + 1}. ${candidate.path}`)
        .join(" | ");
      const results = resolution.candidates.map((candidate) => ({
        path: candidate.path,
        title: candidate.basename,
        score: candidate.score,
        snippet: "Close Markdown note match.",
        matches: ["filename", "path"]
      }));

      this.deps.rememberVaultSearch(query, results);
      this.deps.appendActionReceipt(
        {
          status: "needs_confirmation",
          label: "Choose note",
          detail
        },
        commandText
      );
      this.deps.setStatus("Status: Choose note");
      this.deps.pushActionTimeline(
        "failed",
        "Open needs confirmation",
        detail
      );
      return null;
    }

    const result = {
      path: resolution.candidate.path,
      title: resolution.candidate.basename,
      score: resolution.candidate.score,
      snippet: resolution.reason,
      matches: resolution.reason === "Matched by Rust path resolver."
        ? ["rust-core", "path"]
        : ["filename", "path"]
    };

    this.deps.rememberVaultSearch(query, [result]);
    await this.deps.openVaultPath(result.path, `Opened file: ${result.path}`);
    this.deps.appendActionReceipt(
      {
        status: "opened",
        label: "Opened note",
        detail: `File: ${result.path} | folder: ${getFolderPath(result.path) || "/"} | query: ${query}`,
        path: result.path
      },
      commandText
    );
    this.deps.pushActionTimeline("done", "Opened note", result.path, result.path);
    return result.path;
  }

  private async resolveQuery(query: string): Promise<OpenFileResolution> {
    const directFile = this.deps.resolveDirectCandidate(query);

    if (directFile) {
      return {
        kind: "direct",
        candidate: {
          path: directFile.path,
          basename: directFile.basename,
          folder: getFolderPath(directFile.path),
          score: 999,
        },
        reason: "Matched by file name and folder."
      };
    }

    const paths = this.deps.getMarkdownPaths();
    const localResolution = resolveOpenFileTarget({
      paths,
      query
    });

    if (localResolution.kind !== "none") {
      return localResolution;
    }

    const rustResolved = await this.deps.resolvePathsWithRustCore({
      query,
      paths,
      limit: 3,
      pluginDir: this.deps.pluginDir ?? ""
    });

    if (rustResolved?.length) {
      const result = rustResolved[0];

      return {
        kind: "direct",
        candidate: {
          path: result.path,
          basename:
            result.path.split("/").pop()?.replace(/\.md$/i, "") ??
            result.path,
          folder: getFolderPath(result.path),
          score: result.score
        },
        reason: "Matched by Rust path resolver."
      };
    }

    return localResolution;
  }
}
