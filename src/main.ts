import {
  spawn,
  type ChildProcess
} from "node:child_process";
import {
  appendFileSync,
  mkdirSync
} from "node:fs";
import { dirname, join } from "node:path";
import { Notice, Plugin, requestUrl, TFile, WorkspaceLeaf } from "obsidian";
import { buildContexDoctorReport } from "./diagnostics/contexDoctor";
import { DoctorModal } from "./diagnostics/DoctorModal";
import { rollbackLastAiChangeOperation } from "./history/changeHistory";
import { inlineDiffExtension } from "./editor/inlineDiff";
import { HistoryModal } from "./modals/HistoryModal";
import {
  getRustCoreRuntimeDiagnostics,
  stopRustCoreIndexSession
} from "./rustCore/indexedSearch";
import { ContexSettingTab } from "./settings";
import { sanitizeUiLanguage } from "./i18n";
import {
  applyModelProfile,
  sanitizeModelProfiles
} from "./settings/modelProfiles";
import {
  DEFAULT_SETTINGS,
  VIEW_TYPE_CONTEXT_AGENT,
  type ChatState,
  type WebSearchProvider,
  type WikiMemoryMode,
  type ContexSettings
} from "./types";
import { ContexAgentView } from "./views/AgentSidebarView";
import {
  DEFAULT_KOKORO_VOICE,
  SUPPORTED_KOKORO_VOICES
} from "./voice/kokoroVoices";
import {
  SUPPORTED_SILERO_VOICES
} from "./voice/sileroVoices";
import { sanitizeTtsProvider } from "./voice/ttsProviders";
import {
  type SttHealthPayload,
  isSttHealthCompatible
} from "./voice/sttHealth";
import {
  sanitizeSttBackend,
  sanitizeSttModelForBackend,
  sanitizeSttQualityMode
} from "./voice/sttOptions";
import { getSttRuntimeConfig } from "./voice/sttRuntime";
import {
  getConfiguredLocalSileroVoiceName,
  getEndpointHealthUrl,
  getEndpointPort,
  getLocalKokoroEnvironment,
  getLocalSileroEnvironment,
  getLocalSttEnvironment
} from "./runtime/localServiceConfig";
import {
  ensureContexWikiStructure,
  getContexWikiPaths,
  getContexWikiStatus,
  normalizeWikiRootFolder
} from "./wiki/wikiBootstrap";
import {
  ContexCodeCommandController,
  type ContexCodeAppLike
} from "./contexCode";
import {
  analyzeWikiMaintenance,
  buildWikiMaintenanceMarkdown
} from "./wiki/wikiMaintenance";
import {
  parseWikiJsonl,
  type ContexWikiNode
} from "./wiki/wikiSchema";

type LoadedContexSettings = Partial<ContexSettings> & {
  ttsProvider?: ContexSettings["ttsProvider"];
  chatState?: ChatState;
};

interface LegacyContexSettingsFields {
  chatterboxTtsEndpoint?: unknown;
  chatterboxVoice?: unknown;
  chatterboxModel?: unknown;
}

export default class ContexAgentPlugin extends Plugin {
  settings!: ContexSettings;
  private chatState: ChatState | null = null;
  private localSttProcess: ChildProcess | null = null;
  private localKokoroProcess: ChildProcess | null = null;
  private localSileroProcess: ChildProcess | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_CONTEXT_AGENT,
      (leaf) => new ContexAgentView(leaf, this)
    );
    this.registerEditorExtension(inlineDiffExtension);

    this.addRibbonIcon("message-square", "Open Mindo", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-agent-sidebar",
      name: "Mindo: Open Sidebar",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: "rollback-last-ai-change",
      name: "Mindo: Rollback Last AI Change",
      callback: () => {
        this.runCommand(async () => {
          const operation = await rollbackLastAiChangeOperation(this.app);
          new Notice(`Rolled back AI change in ${operation.filePath}.`);
        });
      }
    });

    this.addCommand({
      id: "show-ai-change-history",
      name: "Mindo: Show AI Change History",
      callback: () => {
        new HistoryModal(this.app).open();
      }
    });

    this.addCommand({
      id: "doctor",
      name: "Mindo: Doctor",
      callback: () => {
        this.openDoctor();
      }
    });

    this.addCommand({
      id: "create-note-from-selection",
      name: "Mindo: Create Note From Selection",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        await view?.createNoteFromCurrentSelection();
        });
      }
    });

    this.addCommand({
      id: "remember-current-note",
      name: "Mindo: Remember Current Note",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        await view?.rememberCurrentNote();
        });
      }
    });

    this.addCommand({
      id: "update-current-note",
      name: "Mindo: Update Current Note",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        await view?.updateCurrentNote();
        });
      }
    });

    this.addCommand({
      id: "create-roadmap-from-note",
      name: "Mindo: Create Roadmap From Current Note",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        await view?.createRoadmapFromCurrentNote();
        });
      }
    });

    this.addCommand({
      id: "save-current-chat-as-note",
      name: "Mindo: Turn Current Chat Into Note",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        await view?.saveCurrentChatAsNote();
        });
      }
    });

    this.addCommand({
      id: "search-vault",
      name: "Mindo: Search Vault",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        view?.focusVaultSearch();
        });
      }
    });

    this.addCommand({
      id: "research-web",
      name: "Mindo: Research Web",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        view?.focusWebResearch();
        });
      }
    });

    this.addCommand({
      id: "semantic-vault-search",
      name: "Mindo: Semantic Vault Search",
      callback: () => {
        this.runCommand(async () => {
        const view = await this.activateView();
        view?.focusSemanticVaultSearch();
        });
      }
    });

    this.addCommand({
      id: "create-code-plan",
      name: "Mindo: Create Code Plan",
      callback: () => {
        this.runCommand(async () => {
          const result = await this.createContexCodeController().createPlan();
          new Notice(`Created Code Plan: ${result.path ?? result.planId}`);
        });
      }
    });

    this.addCommand({
      id: "prepare-code-task-packet",
      name: "Mindo: Prepare Code Task Packet",
      callback: () => {
        this.runCommand(async () => {
          const result = await this.createContexCodeController().prepareTaskPacket();
          await navigator.clipboard.writeText(result.packet);
          new Notice("Mindo Code task packet copied to clipboard.");
        });
      }
    });

    this.addCommand({
      id: "mark-code-task-done",
      name: "Mindo: Mark Code Task Done",
      callback: () => {
        this.runCommand(async () => {
          const result = await this.createContexCodeController().markTaskDone();
          new Notice(`Marked Code task done: ${result.path ?? result.planId}`);
        });
      }
    });

    this.addCommand({
      id: "sync-code-plan",
      name: "Mindo: Sync Code Plan",
      callback: () => {
        this.runCommand(async () => {
          const result = await this.createContexCodeController().syncPlan();
          new Notice(`Synced Code Plan: ${result.path ?? result.planId}`);
        });
      }
    });

    this.addCommand({
      id: "initialize-wiki",
      name: "Mindo: Initialize Wiki",
      callback: () => {
        this.runCommand(async () => {
        const status = await ensureContexWikiStructure(
          this.app,
          this.settings
        );
        new Notice(
          status.initialized
            ? `Mindo Wiki is ready at ${status.root}.`
            : `Mindo Wiki still has ${status.missingFolders.length + status.missingFiles.length} missing items.`
        );
        });
      }
    });

    this.addCommand({
      id: "wiki-status",
      name: "Mindo: Wiki Status",
      callback: () => {
        this.runCommand(async () => {
        const status = await getContexWikiStatus(
          this.app,
          this.settings
        );
        new Notice(
          status.initialized
            ? `Mindo Wiki is initialized at ${status.root}.`
            : `Mindo Wiki is not initialized. Missing ${status.missingFolders.length} folders and ${status.missingFiles.length} files.`
        );
        });
      }
    });

    this.addCommand({
      id: "wiki-maintenance-report",
      name: "Mindo: Wiki Maintenance Report",
      callback: () => {
        this.runCommand(async () => {
        await ensureContexWikiStructure(this.app, this.settings);
        const paths = getContexWikiPaths(this.settings.wikiRootFolder);
        const adapter = this.app.vault.adapter;
        const nodesContent = await adapter.read(paths.schema.nodes).catch(() => "");
        const parsedNodes = parseWikiJsonl<ContexWikiNode>(nodesContent);
        const aliases = await adapter
          .read(paths.schema.aliases)
          .then((content) => JSON.parse(content) as Record<string, string[]>)
          .catch(() => ({}));
        const existingLocators = new Set(
          this.app.vault.getFiles().map((file) => file.path)
        );
        const report = analyzeWikiMaintenance({
          nodes: parsedNodes.records,
          aliases,
          existingLocators
        });

        await adapter.write(
          paths.schema.maintenanceLog,
          buildWikiMaintenanceMarkdown(report, parsedNodes.errors)
        );
        new Notice(
          `Mindo Wiki maintenance report updated: ${paths.schema.maintenanceLog}`
        );
        });
      }
    });

    this.addCommand({
      id: "start-local-stt-server",
      name: "Mindo: Start Local STT Server",
      callback: () => {
        void this.startLocalSttServer();
      }
    });

    this.addCommand({
      id: "stop-local-stt-server",
      name: "Mindo: Stop Local STT Server",
      callback: () => {
        void this.stopLocalSttServer();
      }
    });

    this.addCommand({
      id: "check-local-stt-server",
      name: "Mindo: Check Local STT Server",
      callback: () => {
        this.runCommand(async () => {
        const isHealthy = await this.isLocalSttServerHealthy();
        new Notice(
          isHealthy
            ? "Mindo Local STT Server is responding."
            : "Mindo Local STT Server is not responding yet."
        );
        });
      }
    });

    this.addCommand({
      id: "start-local-kokoro-server",
      name: "Mindo: Start Local Kokoro Server",
      callback: () => {
        void this.startLocalKokoroServer();
      }
    });

    this.addCommand({
      id: "stop-local-kokoro-server",
      name: "Mindo: Stop Local Kokoro Server",
      callback: () => {
        void this.stopLocalKokoroServer();
      }
    });

    this.addCommand({
      id: "check-local-kokoro-server",
      name: "Mindo: Check Local Kokoro Server",
      callback: () => {
        this.runCommand(async () => {
        const isHealthy = await this.isLocalKokoroServerHealthy();
        new Notice(
          isHealthy
            ? "Mindo Local Kokoro Server is responding."
            : "Mindo Local Kokoro Server is not responding yet."
        );
        });
      }
    });

    this.addCommand({
      id: "start-local-silero-server",
      name: "Mindo: Start Local Silero TTS Server",
      callback: () => {
        void this.startLocalSileroServer();
      }
    });

    this.addCommand({
      id: "stop-local-silero-server",
      name: "Mindo: Stop Local Silero TTS Server",
      callback: () => {
        void this.stopLocalSileroServer();
      }
    });

    this.addCommand({
      id: "check-local-silero-server",
      name: "Mindo: Check Local Silero TTS Server",
      callback: () => {
        this.runCommand(async () => {
        const isHealthy = await this.isLocalSileroServerHealthy();
        new Notice(
          isHealthy
            ? "Mindo Local Silero TTS Server is responding."
            : "Mindo Local Silero TTS Server is not responding yet."
        );
        });
      }
    });

    this.addSettingTab(new ContexSettingTab(this.app, this));

    if (this.settings.autoStartLocalStt) {
      void this.startLocalSttServer(false);
    }

    if (
      this.settings.autoStartLocalTts &&
      this.settings.ttsProvider === "kokoro"
    ) {
      void this.startLocalKokoroServer(false);
    }

    if (
      this.settings.autoStartLocalTts &&
      this.settings.ttsProvider === "silero"
    ) {
      void this.startLocalSileroServer(false);
    }

  }

  private runCommand(action: () => Promise<void>): void {
    void action().catch((error) => {
      new Notice(this.getErrorMessage(error));
    });
  }

  private createContexCodeController(): ContexCodeCommandController {
    return new ContexCodeCommandController(
      this.createContexCodeAppLike(),
      this.settings
    );
  }

  private createContexCodeAppLike(): ContexCodeAppLike {
    return {
      vault: {
        adapter: this.app.vault.adapter,
        read: async (file) => {
          const targetFile = this.getContexCodeVaultFile(file.path);
          return this.app.vault.read(targetFile);
        },
        modify: async (file, content) => {
          const targetFile = this.getContexCodeVaultFile(file.path);
          await this.app.vault.modify(targetFile, content);
        }
      },
      workspace: {
        getActiveFile: () => this.app.workspace.getActiveFile()
      }
    };
  }

  private getContexCodeVaultFile(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) {
      throw new Error(`Mindo Code file not found: ${path}`);
    }

    return file;
  }

  onunload(): void {
    stopRustCoreIndexSession();
    void this.stopLocalSttServer(false);
    void this.stopLocalKokoroServer(false);
    void this.stopLocalSileroServer(false);
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as LoadedContexSettings | null;
    const migrated: ContexSettings & LegacyContexSettingsFields = Object.assign(
      {},
      DEFAULT_SETTINGS,
      loaded ?? {}
    );
    const rawTtsProvider = String(
      loaded?.ttsProvider ?? DEFAULT_SETTINGS.ttsProvider
    );

    delete migrated.chatterboxTtsEndpoint;
    delete migrated.chatterboxVoice;
    delete migrated.chatterboxModel;

    migrated.ttsProvider = sanitizeTtsProvider(rawTtsProvider);

    if (!isSupportedWebSearchProvider(String(migrated.webSearchProvider))) {
      migrated.webSearchProvider = DEFAULT_SETTINGS.webSearchProvider;
    }

    migrated.uiLanguage = sanitizeUiLanguage(migrated.uiLanguage);
    migrated.uiFont =
      migrated.uiFont === "obsidian" || migrated.uiFont === "comfortaa"
        ? migrated.uiFont
        : DEFAULT_SETTINGS.uiFont;
    migrated.autoApplyEdits =
      typeof migrated.autoApplyEdits === "boolean"
        ? migrated.autoApplyEdits
        : DEFAULT_SETTINGS.autoApplyEdits;
    migrated.wikiRootFolder = normalizeWikiRootFolder(migrated.wikiRootFolder);
    migrated.wikiEnabled =
      typeof migrated.wikiEnabled === "boolean"
        ? migrated.wikiEnabled
        : DEFAULT_SETTINGS.wikiEnabled;
    migrated.wikiMemoryMode = isSupportedWikiMemoryMode(
      String(migrated.wikiMemoryMode)
    )
      ? (migrated.wikiMemoryMode as WikiMemoryMode)
      : DEFAULT_SETTINGS.wikiMemoryMode;
    if (migrated.wikiMemoryMode === "assisted") {
      migrated.wikiMemoryMode = "auto-safe";
    }

    const sanitizedModelProfiles = sanitizeModelProfiles(migrated);
    migrated.modelProfiles = sanitizedModelProfiles.profiles;
    migrated.activeModelProfileId = sanitizedModelProfiles.activeProfileId;
    migrated.dialogueModelMode =
      migrated.dialogueModelMode === "dual" ? "dual" : "single";
    migrated.dialogueFastModelProfileId = sanitizedModelProfiles.profiles.some(
      (profile) => profile.id === migrated.dialogueFastModelProfileId
    )
      ? migrated.dialogueFastModelProfileId
      : sanitizedModelProfiles.activeProfileId;
    migrated.dialogueSmartModelProfileId = sanitizedModelProfiles.profiles.some(
      (profile) => profile.id === migrated.dialogueSmartModelProfileId
    )
      ? migrated.dialogueSmartModelProfileId
      : sanitizedModelProfiles.activeProfileId;
    Object.assign(
      migrated,
      applyModelProfile(
        migrated,
        sanitizedModelProfiles.profiles.find(
          (profile) => profile.id === sanitizedModelProfiles.activeProfileId
        ) ?? sanitizedModelProfiles.profiles[0]
      )
    );

    migrated.sttBackend = sanitizeSttBackend(migrated.sttBackend);
    migrated.sttQualityMode = sanitizeSttQualityMode(migrated.sttQualityMode);
    migrated.sttModel = sanitizeSttModelForBackend(
      migrated.sttBackend,
      migrated.sttModel
    );
    if (!migrated.sttLanguage || migrated.sttLanguage === "ru") {
      migrated.sttLanguage = DEFAULT_SETTINGS.sttLanguage;
    }

    migrated.webSearchMaxResults = Number.isFinite(migrated.webSearchMaxResults)
      ? Math.min(12, Math.max(1, migrated.webSearchMaxResults))
      : DEFAULT_SETTINGS.webSearchMaxResults;

    if (
      migrated.kokoroTtsEndpoint ===
      "http://127.0.0.1:8880/v1/audio/speech"
    ) {
      migrated.kokoroTtsEndpoint = DEFAULT_SETTINGS.kokoroTtsEndpoint;
    }

    if (migrated.kokoroModel === "kokoro") {
      migrated.kokoroModel = DEFAULT_SETTINGS.kokoroModel;
    }

    if (!SUPPORTED_KOKORO_VOICES.has(migrated.kokoroVoice)) {
      migrated.kokoroVoice = DEFAULT_KOKORO_VOICE;
    }

    if (!SUPPORTED_SILERO_VOICES.has(migrated.sileroVoice)) {
      migrated.sileroVoice = DEFAULT_SETTINGS.sileroVoice;
    }

    migrated.sileroPronunciationDictionary =
      isPronunciationDictionary(migrated.sileroPronunciationDictionary)
        ? {
            ...DEFAULT_SETTINGS.sileroPronunciationDictionary,
            ...migrated.sileroPronunciationDictionary
          }
        : DEFAULT_SETTINGS.sileroPronunciationDictionary;

    this.settings = migrated;
    this.chatState = sanitizeChatState(loaded?.chatState);
  }

  async saveSettings(): Promise<void> {
    await this.saveData({
      ...this.settings,
      chatState: this.chatState
    });
    this.refreshAgentViews();
  }

  getChatState(): ChatState | null {
    return this.chatState;
  }

  openDoctor(): void {
    const report = buildContexDoctorReport({
      settings: this.settings,
      activeNotePath: this.app.workspace.getActiveFile()?.path ?? null,
      rust: getRustCoreRuntimeDiagnostics(),
      services: {
        llm: this.settings.baseUrl.trim() ? "unknown" : "fail",
        stt: "unknown",
        tts: this.settings.ttsProvider === "disabled" ? "disabled" : "unknown",
        web: this.settings.webSearchEnabled ? "unknown" : "disabled"
      }
    });

    new DoctorModal(this.app, report).open();
  }

  async saveChatState(chatState: ChatState): Promise<void> {
    this.chatState = sanitizeChatState(chatState);
    await this.saveData({
      ...this.settings,
      chatState: this.chatState
    });
  }

  async ensureLocalKokoroServer(showNotice = true): Promise<boolean> {
    if (await this.isLocalKokoroServerHealthy()) {
      return true;
    }

    await this.startLocalKokoroServer(showNotice);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await this.isLocalKokoroServerHealthy()) {
        return true;
      }

      await sleep(2000);
    }

    return false;
  }

  async requestLocalKokoroSpeechAudio(text: string): Promise<Blob> {
    const isReady = await this.ensureLocalKokoroServer(true);

    if (!isReady) {
      throw new Error("Local Kokoro JS TTS server is not responding.");
    }

    const endpoint = this.settings.kokoroTtsEndpoint.trim();

    if (!endpoint) {
      throw new Error("Kokoro TTS endpoint is not configured.");
    }

    let response: Awaited<ReturnType<typeof requestUrl>>;

    try {
      response = await requestUrl({
        url: endpoint,
        method: "POST",
        contentType: "application/json",
        headers: {
          Accept: "audio/wav, audio/mpeg, application/octet-stream"
        },
        body: JSON.stringify({
          model: this.settings.kokoroModel || DEFAULT_SETTINGS.kokoroModel,
          input: text,
          voice: this.settings.kokoroVoice || DEFAULT_SETTINGS.kokoroVoice,
          response_format: "wav"
        }),
        throw: false
      });
    } catch (error) {
      throw new Error(
        `Local Kokoro JS TTS endpoint is not reachable at ${endpoint}: ${this.getErrorMessage(error)}`
      );
    }

    if (response.status < 200 || response.status >= 300) {
      const errorText = response.text.trim();
      throw new Error(
        `Local Kokoro JS TTS request failed: ${response.status}${errorText ? `: ${errorText}` : ""}`
      );
    }

    return new Blob([response.arrayBuffer], {
      type: getResponseHeader(response.headers, "content-type") || "audio/wav"
    });
  }

  async requestLocalSileroSpeechAudio(text: string): Promise<Blob> {
    const isReady = await this.ensureLocalSileroServer(true);

    if (!isReady) {
      throw new Error("Local Silero TTS server is not responding.");
    }

    const endpoint = this.settings.sileroTtsEndpoint.trim();

    if (!endpoint) {
      throw new Error("Silero TTS endpoint is not configured.");
    }

    let response: Awaited<ReturnType<typeof requestUrl>>;

    try {
      response = await requestUrl({
        url: endpoint,
        method: "POST",
        contentType: "application/json",
        headers: {
          Accept: "audio/wav, audio/mpeg, application/octet-stream"
        },
        body: JSON.stringify({
          text,
          voice: getConfiguredLocalSileroVoiceName(this.settings),
          pronunciations: this.settings.sileroPronunciationDictionary
        }),
        throw: false
      });
    } catch (error) {
      throw new Error(
        `Local Silero TTS endpoint is not reachable at ${endpoint}: ${this.getErrorMessage(error)}`
      );
    }

    if (response.status < 200 || response.status >= 300) {
      const errorText = response.text.trim();
      throw new Error(
        `Local Silero TTS request failed: ${response.status}${errorText ? `: ${errorText}` : ""}`
      );
    }

    return new Blob([response.arrayBuffer], {
      type: getResponseHeader(response.headers, "content-type") || "audio/wav"
    });
  }

  async ensureLocalSttServer(showNotice = true): Promise<boolean> {
    if (await this.isLocalSttServerHealthy()) {
      return true;
    }

    await this.startLocalSttServer(showNotice);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await this.isLocalSttServerHealthy()) {
        return true;
      }

      await sleep(2000);
    }

    return false;
  }

  async getLocalSttStatus(): Promise<{
    autoStart: boolean;
    backend: string;
    endpoint: string;
    isRunning: boolean;
    language: string;
    model: string;
  }> {
    return {
      autoStart: this.settings.autoStartLocalStt,
      backend: this.settings.sttBackend,
      endpoint: this.settings.sttEndpoint.trim(),
      isRunning: await this.isLocalSttServerHealthy(),
      language: this.settings.sttLanguage.trim() || "auto",
      model: this.settings.sttModel
    };
  }

  async ensureLocalSileroServer(showNotice = true): Promise<boolean> {
    if (await this.isLocalSileroServerHealthy()) {
      return true;
    }

    await this.startLocalSileroServer(showNotice);

    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (await this.isLocalSileroServerHealthy()) {
        return true;
      }

      await sleep(2000);
    }

    return false;
  }

  async activateView(): Promise<ContexAgentView | null> {
    let leaf: WorkspaceLeaf | undefined =
      this.app.workspace.getLeavesOfType(VIEW_TYPE_CONTEXT_AGENT)[0];

    if (!leaf) {
      const rightLeaf =
        this.app.workspace.getRightLeaf(false) ??
        this.app.workspace.getRightLeaf(true);

      if (!rightLeaf) {
        new Notice("Could not open Mindo sidebar.");
        return null;
      }

      leaf = rightLeaf;
      await leaf.setViewState({
        type: VIEW_TYPE_CONTEXT_AGENT,
        active: true
      });
    }

    await this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof ContexAgentView ? leaf.view : null;
  }

  refreshAgentViews(): void {
    this.app.workspace
      .getLeavesOfType(VIEW_TYPE_CONTEXT_AGENT)
      .forEach((leaf) => {
        if (leaf.view instanceof ContexAgentView) {
          leaf.view.refreshSettings();
        }
      });
  }

  private async startLocalSttServer(showNotice = true): Promise<void> {
    if (await this.isLocalSttServerHealthy()) {
      if (showNotice) {
        const runtime = getSttRuntimeConfig(this.settings.sttBackend);
        new Notice(`Mindo ${runtime.startupLabel} STT Server is already responding.`);
      }

      return;
    }

    const health = await this.getLocalSttServerHealth();

    if (health) {
      await this.stopLocalSttServer(false);
    }

    if (this.localSttProcess && this.localSttProcess.exitCode === null) {
      if (showNotice) {
        new Notice("Mindo Local STT Server is already starting.");
      }

      return;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/stt_server/start_stt_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo plugin folder.");
      }

      return;
    }

    const runtime = getSttRuntimeConfig(this.settings.sttBackend);

    this.writeLocalSttLog(
      `\n\n=== Starting Mindo ${runtime.startupLabel} STT Server ===\n`
    );
    this.localSttProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath
      ],
      {
        cwd: pluginDir,
        env: getLocalSttEnvironment(this.settings),
        windowsHide: true,
        stdio: "ignore"
      }
    );

    this.localSttProcess.on("error", (error) => {
      this.localSttProcess = null;
      const message = this.getErrorMessage(error);
      this.writeLocalSttLog(`\nProcess error: ${message}\n`);
      new Notice(`Mindo Local STT Server failed to start: ${message}`);
    });

    if (showNotice) {
      new Notice(
        `Starting Mindo ${runtime.startupLabel} STT Server. ${runtime.firstRunNotice}`
      );
    }

    window.setTimeout(() => {
      void this.showLocalSttStartupStatus(runtime.startupLabel, showNotice);
    }, 6000);
  }

  private async showLocalSttStartupStatus(
    startupLabel: string,
    showNotice: boolean
  ): Promise<void> {
    if (await this.isLocalSttServerHealthy()) {
      if (showNotice) {
        new Notice(`Mindo ${startupLabel} STT Server is ready.`);
      }

      return;
    }

    if (showNotice) {
      new Notice(
        `Mindo ${startupLabel} STT Server is still starting. Use Mindo: Check Local STT Server in a bit.`
      );
    }
  }

  private async stopLocalSttServer(showNotice = true): Promise<void> {
    if (this.localSttProcess && this.localSttProcess.exitCode === null) {
      this.localSttProcess.kill();
      this.localSttProcess = null;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/stt_server/stop_stt_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo STT stop script.");
      }

      return;
    }

    const port = getEndpointPort(this.settings.sttEndpoint, 9000);

    if (showNotice) {
      new Notice(`Stopping Mindo Local STT Server on port ${port}.`);
    }

    await this.runPowerShellScript(pluginDir, scriptPath, [
      "-Port",
      String(port)
    ]);

    if (showNotice) {
      const isHealthy = await this.isLocalSttServerHealthy();
      new Notice(
        isHealthy
          ? "Mindo Local STT Server still appears to be responding."
          : "Mindo Local STT Server stopped."
      );
    }
  }

  private async startLocalKokoroServer(showNotice = true): Promise<void> {
    if (await this.isLocalKokoroServerHealthy()) {
      if (showNotice) {
        new Notice("Mindo Local Kokoro JS TTS Server is already responding.");
      }

      return;
    }

    if (this.localKokoroProcess && this.localKokoroProcess.exitCode === null) {
      if (showNotice) {
        new Notice("Mindo Local Kokoro JS TTS Server is already starting.");
      }

      return;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/tts_server/start_kokoro_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo Kokoro JS start script.");
      }

      return;
    }

    this.writeLocalKokoroLog("\n\n=== Starting Mindo Local Kokoro JS TTS Server ===\n");
    this.localKokoroProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath
      ],
      {
        cwd: pluginDir,
        env: getLocalKokoroEnvironment(this.settings),
        windowsHide: true,
        stdio: "ignore"
      }
    );

    this.localKokoroProcess.on("error", (error) => {
      this.localKokoroProcess = null;
      const message = this.getErrorMessage(error);
      this.writeLocalKokoroLog(`\nProcess error: ${message}\n`);
      new Notice(`Mindo Local Kokoro JS TTS Server failed to start: ${message}`);
    });

    if (showNotice) {
      new Notice(
        "Starting Mindo Local Kokoro JS TTS Server. First English speech may download/load the ONNX model."
      );
    }

    window.setTimeout(() => {
      void this.showLocalKokoroStartupStatus(showNotice);
    }, 6000);
  }

  private async showLocalKokoroStartupStatus(
    showNotice: boolean
  ): Promise<void> {
    if (await this.isLocalKokoroServerHealthy()) {
      if (showNotice) {
        new Notice("Mindo Local Kokoro JS TTS Server is ready.");
      }

      return;
    }

    if (showNotice) {
      new Notice(
        "Mindo Local Kokoro JS TTS Server is still starting. Use Mindo: Check Local Kokoro Server in a bit."
      );
    }
  }

  private async stopLocalKokoroServer(showNotice = true): Promise<void> {
    if (this.localKokoroProcess && this.localKokoroProcess.exitCode === null) {
      this.localKokoroProcess.kill();
      this.localKokoroProcess = null;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/tts_server/stop_kokoro_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo Kokoro JS stop script.");
      }

      return;
    }

    await this.runPowerShellScript(pluginDir, scriptPath, [
      "-Port",
      String(getEndpointPort(this.settings.kokoroTtsEndpoint, 9200))
    ]);

    if (showNotice) {
      const isHealthy = await this.isLocalKokoroServerHealthy();
      new Notice(
        isHealthy
          ? "Mindo Local Kokoro JS TTS Server still appears to be responding."
          : "Mindo Local Kokoro JS TTS Server stopped."
      );
    }
  }

  private async startLocalSileroServer(showNotice = true): Promise<void> {
    if (await this.isLocalSileroServerHealthy()) {
      if (showNotice) {
        new Notice("Mindo Local Silero TTS Server is already responding.");
      }

      return;
    }

    if (this.localSileroProcess && this.localSileroProcess.exitCode === null) {
      if (showNotice) {
        new Notice("Mindo Local Silero TTS Server is already starting.");
      }

      return;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/tts_server/start_silero_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo Silero start script.");
      }

      return;
    }

    this.writeLocalSileroLog("\n\n=== Starting Mindo Local Silero TTS Server ===\n");
    this.localSileroProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath
      ],
      {
        cwd: pluginDir,
        env: getLocalSileroEnvironment(this.settings),
        windowsHide: true,
        stdio: "ignore"
      }
    );

    this.localSileroProcess.on("error", (error) => {
      this.localSileroProcess = null;
      const message = this.getErrorMessage(error);
      this.writeLocalSileroLog(`\nProcess error: ${message}\n`);
      new Notice(`Mindo Local Silero TTS Server failed to start: ${message}`);
    });

    if (showNotice) {
      new Notice(
        "Starting Mindo Local Silero TTS Server. First speech may download/load the selected Russian v5.5 model."
      );
    }
  }

  private async stopLocalSileroServer(showNotice = true): Promise<void> {
    if (this.localSileroProcess && this.localSileroProcess.exitCode === null) {
      this.localSileroProcess.kill();
      this.localSileroProcess = null;
    }

    const pluginDir = this.getPluginFullPath("");
    const scriptPath = this.getPluginFullPath(
      "tools/tts_server/stop_silero_server.ps1"
    );

    if (!pluginDir || !scriptPath) {
      if (showNotice) {
        new Notice("Could not resolve Mindo Silero stop script.");
      }

      return;
    }

    await this.runPowerShellScript(pluginDir, scriptPath, [
      "-Port",
      String(getEndpointPort(this.settings.sileroTtsEndpoint, 9100))
    ]);

    if (showNotice) {
      const isHealthy = await this.isLocalSileroServerHealthy();
      new Notice(
        isHealthy
          ? "Mindo Local Silero TTS Server still appears to be responding."
          : "Mindo Local Silero TTS Server stopped."
      );
    }
  }

  private getPluginFullPath(relativePath: string): string | null {
    const adapter = this.app.vault.adapter as {
      getFullPath?: (normalizedPath: string) => string;
    };

    if (!adapter.getFullPath || !this.manifest.dir) {
      return null;
    }

    return adapter.getFullPath(
      [this.manifest.dir, relativePath].filter(Boolean).join("/")
    );
  }

  private async isLocalSttServerHealthy(): Promise<boolean> {
    const health = await this.getLocalSttServerHealth();

    return isSttHealthCompatible(this.settings, health);
  }

  private async getLocalSttServerHealth(): Promise<SttHealthPayload | null> {
    const healthUrl = this.getLocalSttHealthUrl();

    if (!healthUrl) {
      return null;
    }

    try {
      const response = await requestUrl({
        url: healthUrl,
        method: "GET",
        throw: false
      });

      if (response.status < 200 || response.status >= 300) {
        return null;
      }

      return response.json as SttHealthPayload;
    } catch {
      return null;
    }
  }

  private getLocalSttHealthUrl(): string | null {
    return getEndpointHealthUrl(this.settings.sttEndpoint);
  }

  private async isLocalKokoroServerHealthy(): Promise<boolean> {
    const healthUrl = this.getLocalKokoroHealthUrl();

    if (!healthUrl) {
      return false;
    }

    try {
      const response = await requestUrl({
        url: healthUrl,
        method: "GET",
        throw: false
      });

      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  private getLocalKokoroHealthUrl(): string | null {
    return getEndpointHealthUrl(this.settings.kokoroTtsEndpoint);
  }

  private async isLocalSileroServerHealthy(): Promise<boolean> {
    const healthUrl = this.getLocalSileroHealthUrl();

    if (!healthUrl) {
      return false;
    }

    try {
      const response = await requestUrl({
        url: healthUrl,
        method: "GET",
        throw: false
      });

      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  private getLocalSileroHealthUrl(): string | null {
    return getEndpointHealthUrl(this.settings.sileroTtsEndpoint);
  }

  private async runPowerShellScript(
    cwd: string,
    scriptPath: string,
    args: string[]
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          ...args
        ],
        {
          cwd,
          windowsHide: true,
          stdio: "ignore"
        }
      );

      child.on("error", (error) => {
        this.writeLocalSttLog(
          `\nPowerShell script error: ${this.getErrorMessage(error)}\n`
        );
        resolve(1);
      });
      child.on("exit", (code) => resolve(code ?? 1));
    });
  }

  private writeLocalSttLog(message: string): void {
    const logPath = this.getPluginFullPath(".mindo-stt/stt.log");

    if (!logPath) {
      return;
    }

    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, message);
    } catch (error) {
      console.warn("[Mindo STT] Could not write STT log", error);
    }
  }

  private writeLocalKokoroLog(message: string): void {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    const userProfile = process.env.USERPROFILE?.trim();
    const logPath = localAppData
      ? join(localAppData, "Mindo", "kokoro-js", "kokoro-plugin.log")
      : userProfile
        ? join(
            userProfile,
            "AppData",
            "Local",
            "Mindo",
            "kokoro-js",
            "kokoro-plugin.log"
          )
        : this.getPluginFullPath(".mindo-kokoro-js/kokoro-plugin.log");

    if (!logPath) {
      return;
    }

    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, message);
    } catch (error) {
      console.warn("[Mindo Kokoro] Could not write Kokoro log", error);
    }
  }

  private writeLocalSileroLog(message: string): void {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    const userProfile = process.env.USERPROFILE?.trim();
    const logPath = localAppData
      ? join(localAppData, "Mindo", "silero", "silero-plugin.log")
      : userProfile
        ? join(
            userProfile,
            "AppData",
            "Local",
            "Mindo",
            "silero",
            "silero-plugin.log"
          )
        : this.getPluginFullPath(".mindo-silero/silero-plugin.log");

    if (!logPath) {
      return;
    }

    try {
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, message);
    } catch (error) {
      console.warn("[Mindo Silero] Could not write Silero log", error);
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}

function getResponseHeader(
  headers: Record<string, string> | undefined,
  name: string
): string {
  if (!headers) {
    return "";
  }

  const lowerName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return "";
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function isSupportedWebSearchProvider(
  value: string
): value is WebSearchProvider {
  return value === "searxng" || value === "duckduckgo";
}

function isSupportedWikiMemoryMode(value: string): value is WikiMemoryMode {
  return value === "manual" || value === "assisted" || value === "auto-safe";
}

function isPronunciationDictionary(
  value: unknown
): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, pronunciation]) =>
        typeof key === "string" && typeof pronunciation === "string"
    )
  );
}

function sanitizeChatState(value: unknown): ChatState | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as Partial<ChatState>).sessions)
  ) {
    return null;
  }

  const rawState = value as Partial<ChatState>;
  const rawSessions = rawState.sessions;

  if (!rawSessions) {
    return null;
  }

  const sessions = rawSessions
    .map((session) => {
      if (
        typeof session !== "object" ||
        session === null ||
        typeof session.id !== "string" ||
        typeof session.title !== "string" ||
        !Array.isArray(session.messages)
      ) {
        return null;
      }

      return {
        id: session.id,
        title: session.title || "New chat",
        messages: session.messages.filter(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            typeof message.id === "string" &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string"
        ),
        createdAt:
          typeof session.createdAt === "number"
            ? session.createdAt
            : Date.now(),
        updatedAt:
          typeof session.updatedAt === "number"
            ? session.updatedAt
            : Date.now()
      };
    })
    .filter((session): session is ChatState["sessions"][number] =>
      Boolean(session)
    )
    .slice(0, 30);

  if (!sessions.length) {
    return null;
  }

  const activeChatId =
    typeof rawState.activeChatId === "string" &&
    sessions.some((session) => session.id === rawState.activeChatId)
      ? rawState.activeChatId
      : sessions[0].id;

  return {
    sessions,
    activeChatId
  };
}
