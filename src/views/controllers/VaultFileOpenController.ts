import {
  resolveOpenFileTarget,
  type OpenFileResolution
} from "../../resolver/openFileResolution";
import { getFolderPath } from "../createNotePathUtils";
import type { VoiceSessionMemory } from "../sidebarTypes";

export interface VaultFileOpenFileRef {
  path: string;
}

export interface VaultFileOpenControllerDeps<TFile extends VaultFileOpenFileRef> {
  getMarkdownPaths: () => string[];
  getFileByPath: (path: string) => TFile | null;
  openFileInWorkspace: (file: TFile) => Promise<void>;
  openLinkText: (linkText: string) => Promise<void>;
  getVoiceSessionMemory: () => VoiceSessionMemory;
  setContextDetail: (message: string, isWarning: boolean) => void;
  setError: (error: string | null) => void;
  setStatus: (status: string) => void;
  now?: () => number;
}

export class VaultFileOpenController<
  TFile extends VaultFileOpenFileRef = VaultFileOpenFileRef
> {
  constructor(private readonly deps: VaultFileOpenControllerDeps<TFile>) {}

  resolveOpenFileDecision(query: string): OpenFileResolution {
    return resolveOpenFileTarget({
      paths: this.deps.getMarkdownPaths(),
      query,
      currentPath: this.deps.getVoiceSessionMemory().lastOpenedFile
    });
  }

  resolveOpenFileCandidate(query: string): TFile | null {
    const decision = this.resolveOpenFileDecision(query);

    if (decision.kind !== "direct") {
      return null;
    }

    return this.deps.getFileByPath(decision.candidate.path);
  }

  async openVaultPath(
    path: string,
    contextDetail: string,
    heading?: string
  ): Promise<void> {
    const file = this.deps.getFileByPath(path);

    if (!file) {
      this.deps.setError(`Could not find file: ${path}`);
      this.deps.setStatus("Status: Open failed");
      return;
    }

    if (heading) {
      try {
        await this.deps.openLinkText(`${path}#${heading}`);
      } catch {
        await this.deps.openFileInWorkspace(file);
      }
    } else {
      await this.deps.openFileInWorkspace(file);
    }

    const memory = this.deps.getVoiceSessionMemory();
    memory.lastOpenedFile = path;
    memory.activeFolder = getFolderPath(path);
    memory.updatedAt = this.deps.now?.() ?? Date.now();
    this.deps.setContextDetail(contextDetail, false);
    this.deps.setStatus("Status: Opened file");
  }
}
