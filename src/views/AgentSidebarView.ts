import {
  ItemView,
  MarkdownView,
  MarkdownRenderer,
  Notice,
  normalizePath,
  setIcon,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import {
  getCurrentNoteContext,
  getCurrentNoteLabel
} from "../context/currentNoteContext";
import { getSelectedTextContext } from "../context/selectedTextContext";
import {
  requestLlmChatCompletion,
  requestLlmSystemCompletion,
  streamLlmChatCompletion
} from "../llm/llmClient";
import {
  CreateNoteModal,
  type CreateNoteProposal
} from "../modals/CreateNoteModal";
import { HistoryModal } from "../modals/HistoryModal";
import { ModelProfilesModal } from "../modals/ModelProfilesModal";
import {
  assertWritableVaultPath,
  markAiChangeOperationApplied,
  recordAiChangeOperation,
  rollbackAiChangeOperation
} from "../history/changeHistory";
import {
  clearInlineDiffPreview,
  INLINE_DIFF_ACTION_EVENT,
  showInlineDiffPreview,
  type InlineDiffAction
} from "../editor/inlineDiff";
import { getInlineDiffActionButtons } from "../editor/inlineDiffWorkflow";
import {
  findUniqueTextOccurrence as findUniqueTextOccurrenceInContent
} from "../diff/textOccurrence";
import {
  buildLineDiff,
  getCompactDiffStatusText,
  getDiffPrefix
} from "../diff/lineDiff";
import {
  SELECTED_TEXT_ACTIONS,
  type NoteAction
} from "./noteActions";
import {
  formatVaultSearchResults,
  searchVaultMarkdown
} from "../search/vaultSearch";
import {
  formatSemanticVaultContext,
  searchSemanticVaultMarkdown
} from "../search/semanticVaultSearch";
import {
  formatWebSearchContext,
  formatWebSearchResults,
  searchWeb
} from "../search/webSearch";
import {
  fallbackWebResearchQuery,
  parseSemanticQueryVariants,
  parseWebResearchQueryRewrite
} from "../search/queryHelpers";
import { cleanJsonLikeResponse } from "../llm/jsonResponse";
import { transcribeAudio } from "../voice/voiceClient";
import {
  buildLiveDialogueAcknowledgement,
  buildLiveDialogueActionSpeech,
  createLiveDialogueGreeting,
  isLiveStopOnlyCommand,
  shouldHandleLiveBargeIn,
  type LiveDialogueAcknowledgementKind
} from "../voice/liveDialogue";
import {
  buildLiveDialogueRoutingSystemPrompt,
  buildLiveDialogueRoutingUserPrompt,
  fallbackLiveDialogueRoute,
  parseLiveDialogueRouteDecision
} from "../voice/liveDialogueRouting";
import {
  getLiveDialogueFallbackText,
  getLiveDialogueLatestAssistantText,
  getLiveDialogueLatestUserText,
  getLiveDialogueOrbTitle,
  getLiveDialoguePhaseLabel,
  getLiveDialogueSurfaceState,
  type LiveDialoguePhase,
  type LiveDialogueTranscriptItem
} from "../voice/liveDialogueSurface";
import {
  buildLiveTranscriptValue,
  getSpeechRecognitionLanguage,
  shouldUseFinalTranscription
} from "../voice/liveTranscript";
import { getBestTranscribedText as resolveBestTranscribedText } from "../voice/transcribedTextResolver";
import {
  StreamingSpeechQueue,
  warmStreamingSpeechAudioContext
} from "../voice/streamingSpeech";
import {
  LIVE_BARGE_IN_VOICE_ACTIVITY,
  LIVE_TURN_VOICE_ACTIVITY,
  createVoiceActivityState,
  getNormalizedAudioLevelFromTimeDomainData,
  reduceVoiceActivity,
  type VoiceActivityState
} from "../voice/voiceActivity";
import {
  findSpeechVoice,
  getSpeechText,
  guessSpeechLanguage,
  isMostlyEnglishSpeech,
  prepareSileroSpeechText,
  stripHiddenTtsHints
} from "../voice/speechText";
import {
  getUiLanguageFromObsidianApp,
  getUiText,
  type UiTextKey
} from "../i18n";
import {
  parseSemanticLocalCommandPlan,
  type SemanticLocalCommand
} from "./semanticLocalCommandPlan";
import {
  semanticCommandToLocalAction,
  shouldPreventLocalCommandChatFallback as shouldPreventLocalCommandChatFallbackFromRouter
} from "../tools/localCommandRouter";
import { completeOpenThenReplacePlan } from "../tools/actionPlanCompletion";
import {
  findTextOccurrenceWithRustCore,
  getRustCoreRuntimeDiagnostics,
  resolvePathsWithRustCore
} from "../rustCore/indexedSearch";
import {
  formatBytes,
  renameClipboardFile
} from "../attachments/fileAttachmentUtils";
import { renderMessageAttachments } from "../attachments/attachmentDisplay";
import { formatChatMessageRoleLabel } from "./chatViewRenderer";
import { buildTextReplacementDiffPreview } from "../diff/diffService";
import {
  escapeMarkdownLinkText,
  findLatestUserMessage,
  formatActionReceiptStatus,
  serializeChatMessagesForNote,
  trimChatTitle
} from "../chat/chatMessages";
import { isVaultLocalDescriptionRequest } from "../chat/autoWebGuards";
import { buildToolRouterPrompt } from "../router/toolRouterPrompt";
import { collectVaultCandidates } from "../router/vaultCandidates";
import { planContextWorkflow } from "../web/workflowPlanner";
import {
  ensureContexWikiStructure,
  getContexWikiPaths
} from "../wiki/wikiBootstrap";
import {
  ContexCodeCommandController,
  type ContexCodeAppLike
} from "../contexCode";
import {
  buildRawIngestionMarkdown,
  createRawIngestionRecord,
  getRawIngestionPath
} from "../wiki/wikiRawIngestion";
import { decideWikiAutopilot } from "../wiki/wikiAutopilot";
import {
  createWikiNodeId,
  serializeWikiJsonl,
  type ContexWikiNode
} from "../wiki/wikiSchema";
import {
  buildWikiNodeMarkdown,
  getWikiNodeMarkdownPath
} from "../wiki/wikiWriter";
import { findLatestAssistantSpeechMessage } from "../voice/speechTarget";
import {
  buildPromptImprovementMessages,
  cleanImprovedPrompt
} from "../prompt/promptImprover";
import { applyModelProfile } from "../settings/modelProfiles";
import { AttachmentController } from "./controllers/AttachmentController";
import { ChatController } from "./controllers/ChatController";
import { DiffController } from "./controllers/DiffController";
import { LiveDialogueController } from "./controllers/LiveDialogueController";
import { ModelProfileController } from "./controllers/ModelProfileController";
import { VoiceController } from "./controllers/VoiceController";
import {
  rankOpenFilePathCandidates,
  parseOpenFileQueryParts as parseOpenFileResolverQueryParts,
  scoreOpenFilePathCandidate
} from "../resolver/openFileResolver";
import {
  ActionTimeline,
  type ActionTimelineEventType
} from "../actions/actionTimeline";
import { stripDuplicateLeadingTitle } from "./createNoteContent";
import {
  buildCreateNoteFromCommandPrompt,
  buildCreateNoteFromSelectionPrompt,
  buildCurrentNoteCreatePrompt,
  buildRefineCreateNotePrompt,
  buildRefineCurrentNotePrompt,
  buildRefineResearchNotePrompt,
  buildResearchNotePrompt,
  buildResearchWorkflowSourceText
} from "./createNotePrompts";
import {
  createStreamingGeneratedNote as createStreamingGeneratedNoteFile
} from "./createStreamingGeneratedNote";
import { parseCreateNoteProposalText } from "./createNoteProposal";
import {
  getFolderPath,
  inferCreateNoteTitleFromCommand,
  isSafeCreateNotePath,
  sanitizeCreateNoteFilename,
  slugifyTitle
} from "./createNotePathUtils";
import { ensureFolderForPath, getUniqueNotePath } from "./vaultNoteFiles";
import { trimTextForContext } from "../text/textUtils";
import type {
  AutoWebContext,
  AutoWebDecision,
  LocalCommandAction,
  OpenFileQueryParts,
  SpeechRecognitionConstructor,
  SpeechRecognitionLike,
  TextOccurrenceMatch,
  VoiceMemoryIntent,
  VoiceNoteAction,
  VoiceRecordingStopMode,
  VoiceSessionMemory,
  VoiceTextReplacement
} from "./sidebarTypes";
import type ContexAgentPlugin from "../main";
import {
  DEFAULT_SETTINGS,
  VIEW_TYPE_CONTEXT_AGENT,
  type ActionReceipt,
  type ChatSession,
  type ChatMessage,
  type ContexSettings,
  type CurrentNoteContext,
  type LlmRequestContext,
  type LlmFileAttachment,
  type SelectedTextContext,
  type TextDiffPreview,
  type VaultSearchResult,
  type VaultSourceSection,
  type WebSearchResult
} from "../types";
import type {
  ContexActionKind,
  ContexActionReceipt
} from "../actions/actionTypes";

const MAX_NOTE_ACTION_CONTEXT_CHARS = 12000;
const MAX_WHOLE_NOTE_UPDATE_CHARS = 16000;
const MAX_PROJECT_MEMORY_CONTEXT_CHARS = 6000;
const MAX_RESEARCH_NOTE_SOURCE_CHARS = 12000;
const MAX_ATTACHED_TEXT_CHARS = 12000;
const MAX_ATTACHED_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHED_PDF_BYTES = 10 * 1024 * 1024;
const CONTEXT_METER_TOKEN_BUDGET = 32000;
const CONTEXT_METER_RESERVED_TOKENS = 2500;
const CONTEXT_METER_CHARS_PER_TOKEN = 4;
const PROJECT_MEMORY_FOLDER = "Mindo Memory";
const PROJECT_RESEARCH_FOLDER = "Mindo Research";

export class ContexAgentView extends ItemView {
  private plugin: ContexAgentPlugin;
  private messages: ChatMessage[] = [];
  private chatSessions: ChatSession[] = [];
  private activeChatId: string | null = null;
  private modelEl: HTMLElement | null = null;
  private modelMenuEl: HTMLElement | null = null;
  private chatMenuButtonEl: HTMLButtonElement | null = null;
  private chatMenuEl: HTMLElement | null = null;
  private contexCodeMenuEl: HTMLElement | null = null;
  private moreActionsMenuEl: HTMLElement | null = null;
  private activeActionMenuEl: HTMLElement | null = null;
  private suggestionsEl: HTMLElement | null = null;
  private contextMeterEl: HTMLButtonElement | null = null;
  private contextMeterValueEl: HTMLElement | null = null;
  private autoApplyToggleEl: HTMLButtonElement | null = null;
  private autoApplyToggleLabelEl: HTMLElement | null = null;
  private modelPickerEl: HTMLElement | null = null;
  private modelButtonEl: HTMLButtonElement | null = null;
  private currentNotePillTextEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private sttStatusEl: HTMLElement | null = null;
  private visionEl: HTMLElement | null = null;
  private contextStatusEl: HTMLElement | null = null;
  private contextDetailEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private rootEl: HTMLElement | null = null;
  private chatEl: HTMLElement | null = null;
  private liveDialogueSurfaceEl: HTMLElement | null = null;
  private liveDialogueTranscriptEl: HTMLElement | null = null;
  private liveDialoguePhaseEl: HTMLElement | null = null;
  private liveDialogueOrbEl: HTMLButtonElement | null = null;
  private attachedContextEl: HTMLElement | null = null;
  private promptBoxEl: HTMLElement | null = null;
  private voiceWaveformEl: HTMLElement | null = null;
  private fileInputEl: HTMLInputElement | null = null;
  private attachButtonEl: HTMLButtonElement | null = null;
  private liveDialogueButtonEl: HTMLButtonElement | null = null;
  private voiceTimerEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private useCurrentNoteEl: HTMLInputElement | null = null;
  private useVaultSearchEl: HTMLInputElement | null = null;
  private micButtonEl: HTMLButtonElement | null = null;
  private sendButtonEl: HTMLButtonElement | null = null;
  private noteActionButtons: HTMLButtonElement[] = [];
  private selectionToolbarEl: HTMLElement | null = null;
  private selectionToolbarButtons: HTMLButtonElement[] = [];
  private floatingSelectedTextContext: SelectedTextContext | null = null;
  private lastSelectedTextContext: SelectedTextContext | null = null;
  private lastSelectedTextContextAt = 0;
  private attachedVaultResults: VaultSearchResult[] | null = null;
  private attachedFiles: LlmFileAttachment[] = [];
  private voiceWaveformBars: HTMLElement[] = [];
  private voiceSessionMemory: VoiceSessionMemory = {
    lastFoundFiles: []
  };
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private liveSpeechRecognition: SpeechRecognitionLike | null = null;
  private liveBargeInRecognition: SpeechRecognitionLike | null = null;
  private liveBargeInRestartTimer: number | null = null;
  private liveBargeInDisabledUntil = 0;
  private liveBargeInLastHandledAt = 0;
  private liveDialogueInputStream: MediaStream | null = null;
  private liveDialogueInputStreamPromise: Promise<MediaStream | null> | null = null;
  private liveBargeInAudioStream: MediaStream | null = null;
  private liveBargeInAudioContext: AudioContext | null = null;
  private liveBargeInAudioSource: MediaStreamAudioSourceNode | null = null;
  private liveBargeInAnalyser: AnalyserNode | null = null;
  private liveBargeInAnimationFrame: number | null = null;
  private liveBargeInVoiceActivityState: VoiceActivityState = createVoiceActivityState();
  private isHandlingLiveBargeIn = false;
  private liveTranscriptBaseText = "";
  private liveTranscriptFinalText = "";
  private liveTranscriptLastPreview = "";
  private recordedAudioChunks: Blob[] = [];
  private recordingStopMode: VoiceRecordingStopMode = "insert";
  private activeAudio: HTMLAudioElement | null = null;
  private activeAudioUrl: string | null = null;
  private liveSpeechQueue: StreamingSpeechQueue | null = null;
  private liveAcknowledgementAudioCache = new Map<string, Blob>();
  private liveAcknowledgementAudio: HTMLAudioElement | null = null;
  private liveAcknowledgementAudioUrl: string | null = null;
  private liveAcknowledgementSpeechText = "";
  private speechUtterance: SpeechSynthesisUtterance | null = null;
  private speakingMessageId: string | null = null;
  private speechCompletionResolvers = new Map<
    string,
    (completed: boolean) => void
  >();
  private isLiveDialogueSessionActive = false;
  private isLiveDialogueTurn = false;
  private shouldTranscribeRecording = true;
  private audioContext: AudioContext | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private voiceActivityState: VoiceActivityState = createVoiceActivityState();
  private audioLevelAnimationFrame: number | null = null;
  private recordingStartedAt = 0;
  private recordingTimerInterval: number | null = null;
  private hasLoadedChatState = false;
  private useCurrentNote = true;
  private useVaultSearch = true;
  private isRecording = false;
  private isTranscribingVoice = false;
  private isLoading = false;
  private activeGenerationAbortController: AbortController | null = null;
  private suppressActionReceiptUserContent = false;
  private pendingUserMessageId: string | null = null;
  private pendingUserPrompt: string | null = null;
  private streamingMessageId: string | null = null;
  private activeRefineMessageId: string | null = null;
  private renderSequence = 0;
  private liveDialogueTranscriptRenderSequence = 0;
  private renderTimer: number | null = null;
  private chatPersistTimer: number | null = null;
  private chatMenuCloseTimer: number | null = null;
  private modelMenuCloseTimer: number | null = null;
  private actionMenuCloseTimer: number | null = null;
  private selectionToolbarTimer: number | null = null;
  private shouldAutoScrollChat = true;
  private renderedUiLanguage: string | null = null;
  private actionTimeline = new ActionTimeline(60);
  private readonly attachmentController: AttachmentController;
  private readonly chatController = new ChatController();
  private readonly diffController = new DiffController();
  private readonly liveDialogueController = new LiveDialogueController();
  private readonly modelProfileController = new ModelProfileController();
  private readonly voiceController = new VoiceController();

  constructor(leaf: WorkspaceLeaf, plugin: ContexAgentPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.attachmentController = new AttachmentController({
      maxTextChars: MAX_ATTACHED_TEXT_CHARS,
      maxImageBytes: MAX_ATTACHED_IMAGE_BYTES,
      maxPdfBytes: MAX_ATTACHED_PDF_BYTES
    });
  }

  getViewType(): string {
    return VIEW_TYPE_CONTEXT_AGENT;
  }

  getDisplayText(): string {
    return "Mindo";
  }

  getIcon(): string {
    return "message-square";
  }

  private getUiLanguage(): string {
    return getUiLanguageFromObsidianApp(this.app);
  }

  private t(key: UiTextKey): string {
    return getUiText(this.getUiLanguage(), key);
  }

  private getPluginAssetResourcePath(fileName: string): string {
    const pluginDir = this.plugin.manifest.dir ?? ".obsidian/plugins/mindo";
    const vaultPath = normalizePath(`${pluginDir}/${fileName}`);
    return this.app.vault.adapter.getResourcePath(vaultPath);
  }

  private installRuntimeComfortaaFont(root: HTMLElement): void {
    const fontResourcePath = this.getPluginAssetResourcePath(
      "assets/fonts/comfortaa/Comfortaa-Regular.ttf"
    );
    root.style.setProperty(
      "--mindo-font-family",
      '"Mindo Runtime Comfortaa", "Mindo Comfortaa", var(--font-interface)'
    );

    const styleEl = root.createEl("style", {
      attr: {
        type: "text/css"
      }
    });
    styleEl.setText(
      [
        "@font-face {",
        '  font-family: "Mindo Runtime Comfortaa";',
        `  src: url(${JSON.stringify(fontResourcePath)}) format("truetype");`,
        "  font-style: normal;",
        "  font-weight: 400 700;",
        "  font-display: swap;",
        "}"
      ].join("\n")
    );
  }

  private createMindoLogoImage(parentEl: HTMLElement, className: string): HTMLImageElement {
    return parentEl.createEl("img", {
      cls: className,
      attr: {
        src: this.getPluginAssetResourcePath("assets/logo.png"),
        alt: "",
        "aria-hidden": "true",
        draggable: "false"
      }
    });
  }

  async onOpen(): Promise<void> {
    this.render();
    this.createSelectionToolbar();
    this.registerInterval(
      window.setInterval(() => {
        void this.refreshSttStatus();
      }, 10000)
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshContextStatus())
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.hideSelectionToolbar();
        this.lastSelectedTextContext = null;
        this.lastSelectedTextContextAt = 0;
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.refreshContextStatus()
      )
    );
    this.registerDomEvent(document, "mouseup", () =>
      this.queueSelectionToolbarUpdate()
    );
    this.registerDomEvent(document, "keyup", () =>
      this.queueSelectionToolbarUpdate()
    );
    this.registerDomEvent(document, "selectionchange", () =>
      this.queueSelectionToolbarUpdate()
    );
    this.registerDomEvent(window, "scroll", () =>
      this.queueSelectionToolbarUpdate()
    );
    const inlineDiffActionHandler = (event: Event) => {
      this.handleInlineDiffAction(event);
    };
    document.addEventListener(
      INLINE_DIFF_ACTION_EVENT,
      inlineDiffActionHandler
    );
    this.register(() => {
      document.removeEventListener(
        INLINE_DIFF_ACTION_EVENT,
        inlineDiffActionHandler
      );
    });
  }

  async onClose(): Promise<void> {
    this.stopSpeaking();
    this.stopRecording("discard");
    this.closeModelMenu();
    this.closeChatMenu();
    this.closeActionMenus();

    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    if (this.selectionToolbarTimer !== null) {
      window.clearTimeout(this.selectionToolbarTimer);
      this.selectionToolbarTimer = null;
    }

    if (this.chatPersistTimer !== null) {
      window.clearTimeout(this.chatPersistTimer);
      this.chatPersistTimer = null;
    }

    await this.persistChatState();
    this.selectionToolbarEl?.remove();
    this.selectionToolbarEl = null;
    this.selectionToolbarButtons = [];
    this.floatingSelectedTextContext = null;
    this.contentEl.empty();
  }

  refreshSettings(): void {
    if (!this.modelEl || !this.statusEl) {
      return;
    }

    const uiLanguage = this.getUiLanguage();
    if (this.renderedUiLanguage && this.renderedUiLanguage !== uiLanguage) {
      this.render();
      return;
    }
    this.renderedUiLanguage = uiLanguage;
    this.applyFontMode();

    const activeProfile = this.modelProfileController.getActive(this.plugin.settings);
    this.modelEl.setText(this.getCompactModelProfileLabel(activeProfile));
    this.modelButtonEl?.setAttribute(
      "title",
      `${activeProfile.name} | ${activeProfile.model}`
    );
    this.refreshModelMenu();
    this.refreshAutoApplyToggle();
    this.visionEl?.setText(
      `Vision: ${this.plugin.settings.supportsVision ? "enabled" : "disabled"}`
    );
    this.refreshContextStatus();
    void this.refreshSttStatus();

    if (!this.isLoading) {
      this.statusEl.setText("Status: Ready");
    }
  }

  async createNoteFromCurrentSelection(): Promise<void> {
    await this.createNoteFromSelection();
  }

  async rememberCurrentNote(): Promise<void> {
    await this.createNoteFromCurrentNote({
      fallbackFolder: "Mindo Memory",
      modalTitle: "Create Memory Note",
      statusText: "Status: Drafting memory",
      userPrompt: "Remember current note",
      promptLines: [
        "Turn the current Markdown note into a durable memory note.",
        "Return JSON only with this shape:",
        '{"title":"...","path":"Mindo Memory/... .md","content":"..."}',
        "Keep important decisions, constraints, names, technical terms, and next actions.",
        "Do not include code fences or hidden TTS comments."
      ]
    });
  }

  async updateCurrentNote(userPrompt = "Update the current note safely."): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const note = await this.readActiveMarkdownNote();

    if (!note) {
      this.setError("Open a Markdown note before updating it.");
      this.statusEl?.setText("Status: No current note");
      return;
    }

    if (!note.content.trim()) {
      this.setError("Current note is empty.");
      this.statusEl?.setText("Status: Update blocked");
      return;
    }

    if (note.content.length > MAX_WHOLE_NOTE_UPDATE_CHARS) {
      this.setError(
        `Current note is too long for whole-note update (${note.content.length} characters). Select a section and use Improve selection, or create a roadmap/memory note instead.`
      );
      this.statusEl?.setText("Status: Note too long");
      return;
    }

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Drafting note update");
    const attachedFiles = this.attachedFiles.length
      ? [...this.attachedFiles]
      : null;
    let autoApplyMessageId: string | null = null;

    try {
      const currentNoteContext = {
        path: note.file.path,
        name: note.file.basename,
        content: note.content,
        isTruncated: false,
        originalLength: note.content.length,
        includedLength: note.content.length
      };
      const projectMemory = await this.readProjectMemoryContext();
      const autoWebContext = await this.buildAutoWebContextForRequest(
        userPrompt,
        {
          currentNote: currentNoteContext,
          projectMemory
        }
      );
      const suggested = cleanSuggestedReplacement(
        stripHiddenTtsHints(
          await requestLlmChatCompletion(this.plugin.settings, [
            {
              id: `${Date.now()}-update-note`,
              role: "user",
              content: [
                "Rewrite the current Markdown note into a clearer, better structured version.",
                "Preserve facts, meaning, language, links, frontmatter, code blocks, and important headings.",
                "Return only the full replacement Markdown. Do not add explanations, quotes, code fences, or hidden TTS comments.",
                "",
                "User update request:",
                userPrompt,
                "",
                autoWebContext
                  ? formatAutoWebContextForPrompt(autoWebContext)
                  : "",
                "",
                projectMemory ? formatProjectMemoryForPrompt(projectMemory) : "",
                "",
                "Current note path:",
                note.file.path,
                "",
                "Current note content:",
                note.content
              ].join("\n"),
              createdAt: Date.now()
            }
          ],
          attachedFiles
            ? {
                attachments: attachedFiles
              }
            : null
        )
      ));

      if (!suggested.trim()) {
        throw new Error("LLM returned an empty note update.");
      }

      const userMessage: ChatMessage = {
        id: `${Date.now()}-${this.messages.length}`,
        role: "user",
        content: userPrompt,
        createdAt: Date.now(),
        attachments: attachedFiles
      };
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-${this.messages.length + 1}`,
        role: "assistant",
        content: suggested,
        createdAt: Date.now(),
        diffPreview: buildTextReplacementDiffPreview({
          title: "Update current note preview",
          sourcePath: note.file.path,
          originalOccurrenceIndex: 0,
          original: note.content,
          suggested,
          operationType: "update-note",
          userPrompt
        })
      };
      if (autoWebContext) {
        assistantMessage.webResearchQuery = autoWebContext.query;
        assistantMessage.webSearchQuery = autoWebContext.searchQuery;
        assistantMessage.webResearchResults = autoWebContext.results;
        assistantMessage.webResearchProvider = autoWebContext.provider;
        assistantMessage.webResearchFallbackReason =
          autoWebContext.fallbackReason;
        assistantMessage.webSources = autoWebContext.results;
      }

      this.messages.push(userMessage, assistantMessage);
      this.statusEl?.setText("Status: Preview ready");
      void this.showInlineDiffForMessage(assistantMessage.id);
      autoApplyMessageId = assistantMessage.id;
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Update failed");
    } finally {
      if (attachedFiles) {
        this.attachedFiles = [];
        this.renderAttachedContext();
      }

      this.setLoading(false);
      void this.renderMessages();
      if (autoApplyMessageId) {
        this.queueAutoApplyDiffPreview(autoApplyMessageId);
      }
    }
  }

  async createRoadmapFromCurrentNote(): Promise<void> {
    await this.createNoteFromCurrentNote({
      fallbackFolder: "Mindo Roadmaps",
      modalTitle: "Create Roadmap Note",
      statusText: "Status: Drafting roadmap",
      userPrompt: "Create roadmap from current note",
      promptLines: [
        "Create a practical roadmap note from the current Markdown note.",
        "Return JSON only with this shape:",
        '{"title":"...","path":"Mindo Roadmaps/... .md","content":"..."}',
        "Use clear milestones, concrete tasks, risks, dependencies, and next actions.",
        "Do not include code fences or hidden TTS comments."
      ]
    });
  }

  async saveCurrentChatAsNote(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const chatText = serializeChatMessagesForNote(this.messages);

    if (!chatText.trim()) {
      this.setError("There is no chat conversation to save yet.");
      this.statusEl?.setText("Status: Empty chat");
      return;
    }

    const sourceContext: SelectedTextContext = {
      path: "Mindo Chat",
      name: "Mindo Chat",
      text: chatText,
      isTruncated: false,
      originalLength: chatText.length,
      includedLength: chatText.length
    };

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Turning chat into note");

    try {
      const proposalText = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-conversation-note`,
          role: "user",
          content: [
            "Turn this chat conversation into a useful Markdown note.",
            "Return JSON only with this shape:",
            '{"title":"...","path":"Mindo Chats/... .md","content":"..."}',
            "Use a concise title. Put the note under Mindo Chats.",
            "Keep decisions, useful context, tasks, links, file paths, and open questions.",
            "Do not include code fences or hidden TTS comments.",
            "",
            "Conversation:",
            chatText
          ].join("\n"),
          createdAt: Date.now()
        }
      ]);
      const proposal = await this.prepareCreateNoteProposal(
        proposalText,
        "Mindo Chats"
      );

      new CreateNoteModal(this.app, {
        title: "Create Chat Note",
        createButtonText: "Create",
        proposal,
        onApply: async (editedProposal) => {
          await this.applyCreateNoteProposal(
            editedProposal,
            sourceContext,
            "Turn conversation into note"
          );
        },
        onChange: async (currentProposal, instruction) => {
          return this.refineCreateNoteProposal(
            currentProposal,
            sourceContext,
            instruction
          );
        }
      }).open();
      this.appendActionReceipt({
        status: "preview",
        label: "Drafted chat note",
        detail: proposal.path
      });
      this.statusEl?.setText("Status: Ready");
    } catch (error) {
      const title = trimChatTitle(this.messages[0]?.content ?? "Mindo chat");
      const proposal: CreateNoteProposal = {
        path: await getUniqueNotePath(
          this.app,
          `Mindo Chats/${slugifyTitle(title)}.md`
        ),
        content: chatText
      };

      new CreateNoteModal(this.app, {
        title: "Create Chat Note",
        createButtonText: "Create",
        proposal,
        onApply: async (editedProposal) => {
          await this.applyCreateNoteProposal(
            editedProposal,
            sourceContext,
            "Turn conversation into note"
          );
        }
      }).open();
      this.appendActionReceipt({
        status: "preview",
        label: "Drafted chat note",
        detail: proposal.path
      });
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Draft fallback ready");
    } finally {
      this.setLoading(false);
    }
  }

  focusVaultSearch(): void {
    if (!this.inputEl) {
      return;
    }

    this.inputEl.value = "/search ";
    this.inputEl.focus();
  }

  focusWebResearch(): void {
    if (!this.inputEl) {
      return;
    }

    this.inputEl.value = "/web ";
    this.inputEl.focus();
  }

  focusSemanticVaultSearch(): void {
    if (!this.inputEl) {
      return;
    }

    this.inputEl.value = "/rag ";
    this.inputEl.focus();
  }

  private async improveCurrentPrompt(): Promise<void> {
    const originalPrompt = this.inputEl?.value.trim() ?? "";

    if (!this.inputEl || !originalPrompt) {
      new Notice("Write a prompt first.");
      return;
    }

    this.setError(null);
    this.statusEl?.setText("Status: Improving prompt");
    this.pushActionTimeline("running", "Improving prompt");
    this.setLoading(true);

    try {
      const improvedPrompt = cleanImprovedPrompt(
        await requestLlmChatCompletion(
          this.plugin.settings,
          buildPromptImprovementMessages(originalPrompt),
          null
        )
      );

      if (!improvedPrompt) {
        throw new Error("The model returned an empty improved prompt.");
      }

      this.inputEl.value = improvedPrompt;
      this.statusEl?.setText("Status: Prompt improved");
      this.pushActionTimeline("done", "Prompt improved");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Prompt improvement failed");
      this.pushActionTimeline(
        "failed",
        "Prompt improvement failed",
        this.getErrorMessage(error)
      );
    } finally {
      this.setLoading(false);
      this.inputEl.disabled = false;
      this.inputEl.focus();
    }
  }

  private render(): void {
    this.ensureChatSession();
    const container = this.contentEl;
    container.empty();
    this.noteActionButtons = [];

    const root = container.createDiv({ cls: "contex-agent" });
    this.rootEl = root;
    this.installRuntimeComfortaaFont(root);
    this.applyFontMode();
    this.refreshConversationChrome();
    const header = root.createDiv({ cls: "contex-agent__header" });
    const topBrand = header.createDiv({ cls: "contex-agent__top-brand" });
    topBrand.createEl("img", {
      cls: "contex-agent__top-brand-logo",
      attr: {
        src: this.getPluginAssetResourcePath("assets/logo.png"),
        alt: ""
      }
    });
    topBrand.createSpan({
      cls: "contex-agent__top-brand-text",
      text: this.t("appName")
    });

    const meta = header.createDiv({ cls: "contex-agent__meta" });
    this.modelEl = meta.createDiv();
    this.visionEl = meta.createDiv();
    this.sttStatusEl = meta.createDiv({ cls: "contex-agent__stt-status" });
    this.contextStatusEl = meta.createDiv({ cls: "contex-agent__context" });
    this.contextDetailEl = meta.createDiv({
      cls: "contex-agent__context-detail"
    });
    this.statusEl = meta.createDiv({ cls: "contex-agent__status" });
    this.errorEl = header.createDiv({ cls: "contex-agent__error" });
    this.setError(null);
    this.refreshSettings();
    this.refreshContextStatus();

    this.liveDialogueSurfaceEl = root.createDiv({
      cls: "contex-agent__live-surface",
      attr: {
        "aria-hidden": "true",
        "aria-live": "polite"
      }
    });
    this.liveDialogueTranscriptEl = this.liveDialogueSurfaceEl.createDiv({
      cls: "contex-agent__live-transcript"
    });
    const liveDialogueOrbWrap = this.liveDialogueSurfaceEl.createDiv({
      cls: "contex-agent__live-orb-wrap"
    });
    this.liveDialogueOrbEl = liveDialogueOrbWrap.createEl("button", {
      cls: "contex-agent__live-orb",
      attr: {
        type: "button",
        "aria-label": this.t("startLiveDialogue")
      }
    });
    this.createMindoLogoImage(
      this.liveDialogueOrbEl,
      "contex-agent__live-orb-logo"
    );
    this.liveDialogueOrbEl.addEventListener("click", () => {
      void this.toggleLiveDialogueTurn();
    });
    this.liveDialoguePhaseEl = liveDialogueOrbWrap.createDiv({
      cls: "contex-agent__live-phase",
      text: "Live Dialogue"
    });

    this.suggestionsEl = root.createDiv({
      cls: "contex-agent__suggestions"
    });
    this.renderSuggestions();

    this.chatEl = root.createDiv({
      cls: "contex-agent__chat",
      attr: {
        "aria-label": "Chat messages"
      }
    });
    this.chatEl.addEventListener("scroll", () => {
      this.shouldAutoScrollChat = this.isChatNearBottom();
    });
    void this.renderMessages();

    const composer = root.createDiv({ cls: "contex-agent__composer" });
    this.renderChatSwitcher(composer);

    this.attachedContextEl = composer.createDiv({
      cls: "contex-agent__attached-context"
    });
    this.renderAttachedContext();

    const promptBox = composer.createDiv({
      cls: "contex-agent__prompt-box"
    });
    this.promptBoxEl = promptBox;
    promptBox.addEventListener("dragover", (event) => {
      event.preventDefault();
      promptBox.addClass("is-drag-over");
    });
    promptBox.addEventListener("dragleave", () => {
      promptBox.removeClass("is-drag-over");
    });
    promptBox.addEventListener("drop", (event) => {
      event.preventDefault();
      promptBox.removeClass("is-drag-over");

      if (event.dataTransfer?.files.length) {
        void this.attachFiles(Array.from(event.dataTransfer.files));
      }
    });

    this.fileInputEl = promptBox.createEl("input", {
      attr: {
        type: "file",
        multiple: "true",
        accept: "image/*,.pdf,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html"
      }
    });
    this.fileInputEl.addClass("contex-agent__file-input");
    this.fileInputEl.addEventListener("change", () => {
      const files = this.fileInputEl?.files
        ? Array.from(this.fileInputEl.files)
        : [];

      void this.attachFiles(files);

      if (this.fileInputEl) {
        this.fileInputEl.value = "";
      }
    });

    this.inputEl = promptBox.createEl("textarea", {
      cls: "contex-agent__input",
      attr: {
        placeholder: this.t("composerPlaceholder")
      }
    });

    this.inputEl.addEventListener("keydown", (event) => {
      if (event.isComposing) {
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (this.isRecording) {
          this.stopRecording("send");
          return;
        }

        void this.sendUserMessage();
      }
    });
    this.inputEl.addEventListener("paste", (event) => {
      void this.handlePaste(event);
    });
    this.inputEl.addEventListener("input", () => {
      this.refreshContextMeter();
    });

    const actions = promptBox.createDiv({ cls: "contex-agent__actions" });
    const modelPicker = actions.createDiv({
      cls: "contex-agent__model-picker"
    });
    this.modelPickerEl = modelPicker;

    const modelButton = modelPicker.createEl("button", {
      cls: "contex-agent__model-button",
      attr: {
        type: "button",
        "aria-label": this.t("modelProfiles")
      }
    });
    this.modelButtonEl = modelButton;
    this.modelEl = modelButton.createSpan({
      text: this.getCompactModelProfileLabel(
        this.modelProfileController.getActive(this.plugin.settings)
      )
    });
    modelButton.createSpan({
      cls: "contex-agent__model-status-dot",
      attr: {
        "aria-hidden": "true"
      }
    });
    setIcon(modelButton.createSpan(), "chevron-down");
    modelPicker.addEventListener("mouseenter", () => {
      this.showModelMenu();
    });
    modelPicker.addEventListener("mouseleave", () => {
      this.scheduleCloseModelMenu();
    });
    modelPicker.addEventListener("focusin", () => {
      this.showModelMenu();
    });
    modelPicker.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;

      if (nextTarget instanceof Node && modelPicker.contains(nextTarget)) {
        return;
      }

      this.scheduleCloseModelMenu();
    });
    modelButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showModelMenu();
    });
    this.renderModelMenu(modelPicker);
    this.registerDomEvent(document, "click", (event) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !modelPicker.contains(target)
      ) {
        this.closeModelMenu();
      }
    });

    this.contextMeterEl = actions.createEl("button", {
      cls: "contex-agent__context-meter",
      attr: {
        type: "button",
        "aria-label": "Approximate context usage"
      }
    });
    this.contextMeterEl.createSpan({
      cls: "contex-agent__context-meter-arc",
      attr: {
        "aria-hidden": "true"
      }
    });
    this.contextMeterValueEl = this.contextMeterEl.createSpan({
      cls: "contex-agent__context-meter-value",
      text: "0%"
    });

    this.voiceWaveformEl = actions.createDiv({
      cls: "contex-agent__voice-waveform",
      attr: {
        "aria-hidden": "true"
      }
    });
    this.voiceWaveformBars = [];
    for (let index = 0; index < 17; index += 1) {
      this.voiceWaveformBars.push(
        this.voiceWaveformEl.createSpan({
          cls: "contex-agent__voice-waveform-bar"
        })
      );
    }

    const spacer = actions.createDiv({ cls: "contex-agent__actions-spacer" });
    spacer.setText("");

    const attachButton = actions.createEl("button", {
      cls: "contex-agent__icon-button contex-agent__icon-button--ghost",
      attr: {
        type: "button",
        "aria-label": this.t("attachFiles")
      }
    });
    this.attachButtonEl = attachButton;
    setIcon(attachButton, "paperclip");
    attachButton.addEventListener("click", () => {
      this.fileInputEl?.click();
    });

    this.liveDialogueButtonEl = actions.createEl("button", {
      cls: "contex-agent__icon-button contex-agent__live-dialogue-button",
      attr: {
        type: "button",
        "aria-label": this.t("startLiveDialogue")
      }
    });
    this.createMindoLogoImage(
      this.liveDialogueButtonEl,
      "contex-agent__live-dialogue-logo"
    );
    this.liveDialogueButtonEl.addEventListener("click", () => {
      void this.toggleLiveDialogueTurn();
    });

    this.voiceTimerEl = actions.createDiv({
      cls: "contex-agent__voice-timer",
      text: "0:00"
    });

    this.micButtonEl = actions.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("recordVoice")
      }
    });
    setIcon(this.micButtonEl, "mic");
    this.micButtonEl.addEventListener("click", () => {
      void this.toggleRecording();
    });

    this.autoApplyToggleEl = actions.createEl("button", {
      cls: "contex-agent__auto-apply-toggle",
      attr: {
        type: "button",
        role: "switch",
        "aria-label": "Auto apply edit previews"
      }
    });
    this.autoApplyToggleLabelEl = this.autoApplyToggleEl.createSpan({
      cls: "contex-agent__auto-apply-label"
    });
    this.autoApplyToggleEl.createSpan({
      cls: "contex-agent__auto-apply-knob",
      attr: {
        "aria-hidden": "true"
      }
    });
    this.autoApplyToggleEl.addEventListener("click", () => {
      void this.toggleAutoApplyEdits();
    });

    this.sendButtonEl = actions.createEl("button", {
      cls: "contex-agent__send-button",
      attr: {
        type: "button",
        "aria-label": this.t("send")
      }
    });
    setIcon(this.sendButtonEl, "arrow-up");
    this.sendButtonEl.addEventListener("click", () => {
      if (this.isRecording) {
        this.stopRecording("send");
        return;
      }

      if (this.isTranscribingVoice) {
        return;
      }

      if (this.isLoading) {
        this.cancelCurrentGeneration();
        return;
      }

      void this.sendUserMessage();
    });

    this.refreshLiveDialogueSurface();
    this.refreshContextMeter();
    this.refreshAutoApplyToggle();
  }

  private ensureChatSession(): void {
    if (!this.hasLoadedChatState) {
      const persistedState = this.plugin.getChatState();

      if (persistedState?.sessions.length) {
        this.chatSessions = persistedState.sessions;
        this.activeChatId =
          persistedState.activeChatId &&
          persistedState.sessions.some(
            (session) => session.id === persistedState.activeChatId
          )
            ? persistedState.activeChatId
            : persistedState.sessions[0].id;
      }

      this.hasLoadedChatState = true;
    }

    if (!this.chatSessions.length) {
      const session = this.createChatSession("New chat");
      this.chatSessions.push(session);
      this.activeChatId = session.id;
      this.messages = session.messages;
      return;
    }

    const activeSession =
      this.chatSessions.find((session) => session.id === this.activeChatId) ??
      this.chatSessions[0];
    this.activeChatId = activeSession.id;
    this.messages = activeSession.messages;
  }

  private createChatSession(title: string): ChatSession {
    const createdAt = Date.now();

    return {
      id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      messages: [],
      createdAt,
      updatedAt: createdAt
    };
  }

  private startNewChat(): void {
    const session = this.createChatSession(`Chat ${this.chatSessions.length + 1}`);
    this.chatSessions.unshift(session);
    this.activeChatId = session.id;
    this.messages = session.messages;
    this.activeRefineMessageId = null;
    this.attachedVaultResults = null;
    this.renderAttachedContext();
    this.refreshChatSelect();
    this.renderSuggestions();
    void this.renderMessages();

    if (this.inputEl) {
      this.inputEl.focus();
    }
  }

  private switchChat(sessionId: string): void {
    const session = this.chatSessions.find((chat) => chat.id === sessionId);

    if (!session) {
      return;
    }

    this.activeChatId = session.id;
    this.messages = session.messages;
    this.activeRefineMessageId = null;
    this.refreshChatSelect();
    this.renderSuggestions();
    void this.renderMessages();
  }

  private deleteCurrentChat(): void {
    if (this.chatSessions.length <= 1 || !this.activeChatId) {
      this.messages = [];
      this.chatSessions[0].messages = this.messages;
      this.chatSessions[0].title = "New chat";
      this.refreshChatSelect();
      this.renderSuggestions();
      void this.renderMessages();
      return;
    }

    this.chatSessions = this.chatSessions.filter(
      (session) => session.id !== this.activeChatId
    );
    this.activeChatId = this.chatSessions[0].id;
    this.messages = this.chatSessions[0].messages;
    this.refreshChatSelect();
    this.renderSuggestions();
    void this.renderMessages();
  }

  private renderChatSwitcher(parentEl: HTMLElement): void {
    const switcherEl = parentEl.createDiv({
      cls: "contex-agent__chat-switcher"
    });

    const pickerEl = switcherEl.createDiv({
      cls: "contex-agent__chat-picker"
    });
    pickerEl.addEventListener("mouseenter", () => {
      this.showChatMenu();
    });
    pickerEl.addEventListener("mouseleave", () => {
      this.scheduleCloseChatMenu();
    });
    pickerEl.addEventListener("focusin", () => {
      this.showChatMenu();
    });
    pickerEl.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;

      if (nextTarget instanceof Node && pickerEl.contains(nextTarget)) {
        return;
      }

      this.scheduleCloseChatMenu();
    });
    this.chatMenuButtonEl = pickerEl.createEl("button", {
      cls: "contex-agent__chat-menu-button",
      attr: {
        type: "button",
        "aria-label": this.t("switchChat")
      }
    });
    this.chatMenuButtonEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showChatMenu();
    });
    this.chatMenuEl = pickerEl.createDiv({
      cls: "contex-agent__chat-menu"
    });
    this.chatMenuEl.style.display = "none";
    this.chatMenuEl.addEventListener("mouseenter", () => {
      this.cancelScheduledChatMenuClose();
    });
    this.chatMenuEl.addEventListener("mouseleave", () => {
      this.scheduleCloseChatMenu();
    });

    this.registerDomEvent(document, "click", (event) => {
      const target = event.target;

      if (target instanceof Node && !pickerEl.contains(target)) {
        this.closeChatMenu();
      }
    });

    const newChatButton = switcherEl.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("newChat")
      }
    });
    setIcon(newChatButton, "message-square-plus");
    newChatButton.addEventListener("click", () => {
      this.startNewChat();
    });

    const deleteChatButton = switcherEl.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("clearCurrentChat")
      }
    });
    setIcon(deleteChatButton, "trash-2");
    deleteChatButton.addEventListener("click", () => {
      this.deleteCurrentChat();
    });

    const changeHistoryButton = switcherEl.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("changeHistory")
      }
    });
    setIcon(changeHistoryButton, "history");
    changeHistoryButton.addEventListener("click", () => {
      new HistoryModal(this.app).open();
    });

    const contexCodePicker = switcherEl.createDiv({
      cls: "contex-agent__hover-action-picker"
    });
    const contexCodeButton = contexCodePicker.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("contexCode")
      }
    });
    setIcon(contexCodeButton, "list-todo");
    this.contexCodeMenuEl = this.renderHoverActionMenu(contexCodePicker, [
      {
        icon: "map",
        label: this.t("createCodePlan"),
        action: () => {
          void this.createContexCodePlan();
        }
      },
      {
        icon: "package",
        label: this.t("prepareCodeTaskPacket"),
        action: () => {
          void this.prepareContexCodeTaskPacket();
        }
      },
      {
        icon: "check-circle",
        label: this.t("markCodeTaskDone"),
        action: () => {
          void this.markContexCodeTaskDone();
        }
      },
      {
        icon: "refresh-cw",
        label: this.t("syncCodePlan"),
        action: () => {
          void this.syncContexCodePlan();
        }
      }
    ]);
    this.bindHoverActionMenu(
      contexCodePicker,
      contexCodeButton,
      this.contexCodeMenuEl
    );

    const morePicker = switcherEl.createDiv({
      cls: "contex-agent__hover-action-picker"
    });
    const moreButton = morePicker.createEl("button", {
      cls: "contex-agent__icon-button",
      attr: {
        type: "button",
        "aria-label": this.t("moreActions")
      }
    });
    setIcon(moreButton, "more-horizontal");
    this.moreActionsMenuEl = this.renderHoverActionMenu(morePicker, [
      {
        icon: "sparkles",
        label: this.t("improvePrompt"),
        action: () => {
          void this.improveCurrentPrompt();
        }
      },
      {
        icon: "file-text",
        label: this.t("turnChatIntoNote"),
        action: () => {
          void this.saveCurrentChatAsNote();
        }
      },
      {
        icon: "globe",
        label: this.t("researchWeb"),
        action: () => {
          this.focusWebResearch();
        }
      },
      {
        icon: "search",
        label: this.t("semanticVaultSearch"),
        action: () => {
          this.focusSemanticVaultSearch();
        }
      },
      {
        icon: "sliders-horizontal",
        label: this.t("manageModelProfiles"),
        action: () => {
          this.openModelProfilesModal();
        }
      },
      {
        icon: "heart-pulse",
        label: this.t("checkHealth"),
        action: () => {
          void this.checkSystemHealth();
        }
      },
      {
        icon: "wrench",
        label: this.t("diagnostics"),
        action: () => {
          void this.plugin.openDoctor();
        }
      }
    ]);
    this.bindHoverActionMenu(
      morePicker,
      moreButton,
      this.moreActionsMenuEl
    );

    this.registerDomEvent(document, "click", (event) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !contexCodePicker.contains(target) &&
        !morePicker.contains(target)
      ) {
        this.closeActionMenus();
      }
    });

    this.refreshChatSelect();
  }

  private refreshChatSelect(): void {
    if (!this.chatMenuButtonEl || !this.chatMenuEl) {
      return;
    }

    this.updateActiveChatTitle();
    const activeSession = this.chatSessions.find(
      (session) => session.id === this.activeChatId
    );

    this.chatMenuButtonEl.empty();
    this.chatMenuButtonEl.createSpan({
      cls: "contex-agent__chat-menu-label",
      text: activeSession?.title ?? this.t("newChat")
    });
    setIcon(this.chatMenuButtonEl.createSpan(), "chevron-down");

    this.chatMenuEl.empty();
    this.chatSessions.forEach((session) => {
      const itemEl = this.chatMenuEl?.createEl("button", {
        cls: "contex-agent__chat-menu-item",
        text: session.title,
        attr: {
          type: "button"
        }
      });
      itemEl?.toggleClass("is-active", session.id === this.activeChatId);
      itemEl?.addEventListener("click", (event) => {
        event.stopPropagation();
        this.switchChat(session.id);
        this.closeChatMenu();
      });
    });
  }

  private toggleChatMenu(): void {
    if (!this.chatMenuEl) {
      return;
    }

    const isOpen = this.chatMenuEl.style.display !== "none";
    if (isOpen) {
      this.closeChatMenu();
      return;
    }

    this.showChatMenu();
  }

  private showChatMenu(): void {
    if (!this.chatMenuEl) {
      return;
    }

    this.cancelScheduledChatMenuClose();
    this.closeModelMenu();
    this.closeActionMenus();
    this.chatMenuEl.style.display = "block";
  }

  private scheduleCloseChatMenu(): void {
    this.cancelScheduledChatMenuClose();
    this.chatMenuCloseTimer = window.setTimeout(() => {
      this.closeChatMenu();
    }, 260);
  }

  private cancelScheduledChatMenuClose(): void {
    if (this.chatMenuCloseTimer === null) {
      return;
    }

    window.clearTimeout(this.chatMenuCloseTimer);
    this.chatMenuCloseTimer = null;
  }

  private closeChatMenu(): void {
    this.cancelScheduledChatMenuClose();
    if (this.chatMenuEl) {
      this.chatMenuEl.style.display = "none";
    }
  }

  private renderHoverActionMenu(
    parentEl: HTMLElement,
    items: Array<{ icon: string; label: string; action: () => void }>
  ): HTMLElement {
    const menuEl = parentEl.createDiv({
      cls: "contex-agent__action-menu"
    });
    menuEl.style.display = "none";

    items.forEach((item) => {
      const itemEl = menuEl.createEl("button", {
        cls: "contex-agent__action-menu-item",
        attr: {
          type: "button"
        }
      });
      const iconEl = itemEl.createSpan({
        cls: "contex-agent__action-menu-item-icon",
        attr: {
          "aria-hidden": "true"
        }
      });
      setIcon(iconEl, item.icon);
      itemEl.createSpan({
        cls: "contex-agent__action-menu-item-label",
        text: item.label
      });

      itemEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.closeActionMenus();
        item.action();
      });
    });

    return menuEl;
  }

  private bindHoverActionMenu(
    pickerEl: HTMLElement,
    buttonEl: HTMLButtonElement,
    menuEl: HTMLElement
  ): void {
    pickerEl.addEventListener("mouseenter", () => {
      this.showActionMenu(menuEl);
    });
    pickerEl.addEventListener("mouseleave", () => {
      this.scheduleCloseActionMenu();
    });
    pickerEl.addEventListener("focusin", () => {
      this.showActionMenu(menuEl);
    });
    pickerEl.addEventListener("focusout", (event) => {
      const nextTarget = event.relatedTarget;

      if (nextTarget instanceof Node && pickerEl.contains(nextTarget)) {
        return;
      }

      this.scheduleCloseActionMenu();
    });
    buttonEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showActionMenu(menuEl);
    });
    menuEl.addEventListener("mouseenter", () => {
      this.cancelScheduledActionMenuClose();
    });
    menuEl.addEventListener("mouseleave", () => {
      this.scheduleCloseActionMenu();
    });
  }

  private showActionMenu(menuEl: HTMLElement): void {
    this.cancelScheduledActionMenuClose();
    this.closeChatMenu();
    this.closeModelMenu();

    if (this.activeActionMenuEl && this.activeActionMenuEl !== menuEl) {
      this.activeActionMenuEl.style.display = "none";
    }

    this.activeActionMenuEl = menuEl;
    menuEl.style.display = "block";
  }

  private scheduleCloseActionMenu(): void {
    this.cancelScheduledActionMenuClose();
    this.actionMenuCloseTimer = window.setTimeout(() => {
      this.closeActionMenus();
    }, 260);
  }

  private cancelScheduledActionMenuClose(): void {
    if (this.actionMenuCloseTimer === null) {
      return;
    }

    window.clearTimeout(this.actionMenuCloseTimer);
    this.actionMenuCloseTimer = null;
  }

  private closeActionMenus(): void {
    this.cancelScheduledActionMenuClose();
    this.contexCodeMenuEl?.style.setProperty("display", "none");
    this.moreActionsMenuEl?.style.setProperty("display", "none");
    this.activeActionMenuEl = null;
  }

  private updateActiveChatTitle(): void {
    const activeSession = this.chatSessions.find(
      (session) => session.id === this.activeChatId
    );

    if (!activeSession) {
      return;
    }

    const firstUserMessage = activeSession.messages.find(
      (message) => message.role === "user" && message.content.trim()
    );

    if (firstUserMessage) {
      activeSession.title = trimChatTitle(firstUserMessage.content);
    }

    activeSession.updatedAt = Date.now();
  }

  private renderSuggestions(): void {
    if (!this.suggestionsEl) {
      return;
    }

    this.refreshConversationChrome();
    this.suggestionsEl.empty();
    this.suggestionsEl.toggleClass(
      "contex-agent__suggestions--hidden",
      this.messages.length > 0
    );

    if (this.messages.length > 0) {
      return;
    }

    const homeHero = this.suggestionsEl.createDiv({
      cls: "contex-agent__home-hero"
    });
    const homeLogoWrap = homeHero.createDiv({
      cls: "contex-agent__home-logo-wrap"
    });
    homeLogoWrap.createEl("img", {
      cls: "contex-agent__home-logo",
      attr: {
        src: this.getPluginAssetResourcePath("assets/logo.png"),
        alt: this.t("appName")
      }
    });
    homeHero.createDiv({
      cls: "contex-agent__home-greeting",
      text: this.t("homeGreeting")
    });
  }

  private refreshConversationChrome(): void {
    this.rootEl?.toggleClass("contex-agent--has-chat", this.messages.length > 0);
    this.rootEl?.toggleClass("contex-agent--home", this.messages.length === 0);
    this.refreshContextMeter();
  }

  private applyFontMode(): void {
    const useComfortaa = this.plugin.settings.uiFont === "comfortaa";
    this.rootEl?.toggleClass("contex-agent--font-comfortaa", useComfortaa);
    this.rootEl?.toggleClass("contex-agent--font-obsidian", !useComfortaa);
  }

  private refreshContextMeter(): void {
    if (!this.contextMeterEl || !this.contextMeterValueEl) {
      return;
    }

    const usage = this.calculateApproximateContextUsage();
    this.contextMeterValueEl.setText(`${usage.percent}%`);
    this.contextMeterEl.style.setProperty(
      "--contex-context-fill",
      `${Math.round(usage.percent * 1.8)}deg`
    );
    this.contextMeterEl.toggleClass("is-warn", usage.percent >= 70);
    this.contextMeterEl.toggleClass("is-high", usage.percent >= 88);
    this.contextMeterEl.setAttribute(
      "title",
      [
        `Approx. context: ${usage.percent}%`,
        `~${usage.tokens.toLocaleString()} / ${CONTEXT_METER_TOKEN_BUDGET.toLocaleString()} tokens`,
        `Chat ${usage.chatTokens.toLocaleString()}`,
        `Input ${estimateTokensFromChars(this.inputEl?.value.length ?? 0).toLocaleString()}`,
        `Note ${usage.noteTokens.toLocaleString()}`,
        `Attached ${usage.attachedTokens.toLocaleString()}`,
        `Reserved ${CONTEXT_METER_RESERVED_TOKENS.toLocaleString()}`
      ].join(" | ")
    );
    this.contextMeterEl.setAttribute(
      "aria-label",
      `Approximate context usage ${usage.percent}%`
    );
  }

  private calculateApproximateContextUsage(): {
    percent: number;
    tokens: number;
    chatTokens: number;
    noteTokens: number;
    attachedTokens: number;
  } {
    const chatChars = this.messages.reduce((total, message) => {
      const attachmentChars =
        message.attachments?.reduce(
          (sum, attachment) => sum + this.estimateAttachmentContextChars(attachment),
          0
        ) ?? 0;
      return total + message.content.length + attachmentChars;
    }, this.inputEl?.value.length ?? 0);
    const noteChars = this.estimateActiveNoteContextChars();
    const pendingAttachmentChars = this.attachedFiles.reduce(
      (total, attachment) =>
        total + this.estimateAttachmentContextChars(attachment),
      0
    );
    const searchChars =
      this.attachedVaultResults?.reduce(
        (total, result) =>
          total + result.path.length + result.title.length + result.snippet.length,
        0
      ) ?? 0;
    const chatTokens = estimateTokensFromChars(chatChars);
    const noteTokens = estimateTokensFromChars(noteChars);
    const attachedTokens = estimateTokensFromChars(
      pendingAttachmentChars + searchChars
    );
    const tokens =
      CONTEXT_METER_RESERVED_TOKENS + chatTokens + noteTokens + attachedTokens;
    const percent = Math.min(
      100,
      Math.max(0, Math.round((tokens / CONTEXT_METER_TOKEN_BUDGET) * 100))
    );

    return {
      percent,
      tokens,
      chatTokens,
      noteTokens,
      attachedTokens
    };
  }

  private estimateActiveNoteContextChars(): number {
    if (!this.useCurrentNote) {
      return 0;
    }

    const file = this.app.workspace.getActiveFile();

    if (!file || file.extension !== "md") {
      return 0;
    }

    return Math.min(file.stat.size, MAX_NOTE_ACTION_CONTEXT_CHARS);
  }

  private estimateAttachmentContextChars(attachment: LlmFileAttachment): number {
    if (attachment.text?.trim()) {
      return Math.min(attachment.text.length, MAX_ATTACHED_TEXT_CHARS);
    }

    return Math.min(Math.ceil(attachment.size / 2), MAX_ATTACHED_TEXT_CHARS);
  }

  private isAutoApplyEditsEnabled(): boolean {
    return this.plugin.settings.autoApplyEdits === true;
  }

  private refreshAutoApplyToggle(): void {
    if (!this.autoApplyToggleEl || !this.autoApplyToggleLabelEl) {
      return;
    }

    const enabled = this.isAutoApplyEditsEnabled();
    this.autoApplyToggleEl.toggleClass("is-active", enabled);
    this.autoApplyToggleEl.setAttribute("aria-checked", String(enabled));
    this.autoApplyToggleEl.setAttribute(
      "title",
      enabled
        ? "Auto mode is on: edit previews apply immediately."
        : "Manual mode: edit previews wait for approval."
    );
    this.autoApplyToggleLabelEl.setText(enabled ? "Auto" : "Manual");
  }

  private async toggleAutoApplyEdits(): Promise<void> {
    const next = !this.isAutoApplyEditsEnabled();

    this.plugin.settings.autoApplyEdits = next;
    await this.plugin.saveSettings();
    this.refreshAutoApplyToggle();
  }

  private queueAutoApplyDiffPreview(messageId: string): void {
    if (!this.isAutoApplyEditsEnabled()) {
      return;
    }

    this.statusEl?.setText("Status: Auto applying edit");
    window.setTimeout(() => {
      if (this.isAutoApplyEditsEnabled()) {
        void this.applyDiffPreview(messageId);
      }
    }, 0);
  }

  private async runNoteAction(action: NoteAction): Promise<void> {
    if (action.kind === "remember-note") {
      await this.rememberCurrentNote();
      return;
    }

    if (action.kind === "update-current-note") {
      await this.updateCurrentNote();
      return;
    }

    if (action.kind === "create-roadmap") {
      await this.createRoadmapFromCurrentNote();
      return;
    }

    await this.sendNoteAction(action.prompt);
  }

  private renderModelMenu(parentEl: HTMLElement): void {
    this.modelMenuEl = parentEl.createDiv({
      cls: "contex-agent__model-menu"
    });
    this.modelMenuEl.style.display = "none";
    this.modelMenuEl.addEventListener("mouseenter", () => {
      this.cancelScheduledModelMenuClose();
    });
    this.modelMenuEl.addEventListener("mouseleave", () => {
      this.scheduleCloseModelMenu();
    });
    this.refreshModelMenu();
  }

  private refreshModelMenu(): void {
    if (!this.modelMenuEl) {
      return;
    }

    const activeProfile = this.modelProfileController.getActive(this.plugin.settings);
    this.modelMenuEl.empty();

    this.plugin.settings.modelProfiles.forEach((profile) => {
      const compactLabel = this.getCompactModelProfileLabel(profile);
      const itemEl = this.modelMenuEl?.createEl("button", {
        cls: "contex-agent__model-menu-item",
        attr: {
          type: "button",
          "aria-label": `${profile.name} | ${profile.model} | ${profile.baseUrl}`
        }
      });

      itemEl?.toggleClass("is-active", profile.id === activeProfile.id);
      itemEl?.createSpan({
        cls: "contex-agent__model-menu-item-name",
        text: compactLabel
      });
      itemEl?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.settings = this.modelProfileController.apply(
          this.plugin.settings,
          profile
        );
        this.refreshSettings();
        this.closeModelMenu();
        void this.plugin.saveSettings();
      });
    });
  }

  private showModelMenu(): void {
    if (!this.modelMenuEl) {
      return;
    }

    this.cancelScheduledModelMenuClose();
    this.closeChatMenu();
    this.closeActionMenus();
    this.modelMenuEl.style.display = "block";
  }

  private scheduleCloseModelMenu(): void {
    this.cancelScheduledModelMenuClose();
    this.modelMenuCloseTimer = window.setTimeout(() => {
      this.closeModelMenu();
    }, 260);
  }

  private cancelScheduledModelMenuClose(): void {
    if (this.modelMenuCloseTimer === null) {
      return;
    }

    window.clearTimeout(this.modelMenuCloseTimer);
    this.modelMenuCloseTimer = null;
  }

  private closeModelMenu(): void {
    this.cancelScheduledModelMenuClose();
    this.modelMenuEl?.style.setProperty("display", "none");
  }

  private openModelProfilesModal(): void {
    this.closeModelMenu();
    new ModelProfilesModal(this.app, {
      settings: this.plugin.settings,
      onSave: async (settings) => {
        this.plugin.settings = settings;
        await this.plugin.saveSettings();
        this.refreshSettings();
      }
    }).open();
  }

  private getCompactModelProfileLabel(
    profile: { name: string; model: string }
  ): string {
    return compactModelProfileLabel(profile.name || profile.model);
  }

  private async getLiveDialogueLlmSettings(
    content: string,
    context: LlmRequestContext | null | undefined,
    signal: AbortSignal
  ): Promise<ContexSettings> {
    const settings = this.plugin.settings;

    if (settings.dialogueModelMode !== "dual") {
      return settings;
    }

    const fastProfile = settings.modelProfiles.find(
      (item) => item.id === settings.dialogueFastModelProfileId
    );
    const smartProfile = settings.modelProfiles.find(
      (item) => item.id === settings.dialogueSmartModelProfileId
    );
    const fastSettings = fastProfile
      ? applyModelProfile(settings, fastProfile)
      : settings;
    const smartSettings = smartProfile
      ? applyModelProfile(settings, smartProfile)
      : settings;

    try {
      this.statusEl?.setText("Status: Choosing response depth");
      const routerResponse = await requestLlmSystemCompletion(
        fastSettings,
        buildLiveDialogueRoutingSystemPrompt(),
        buildLiveDialogueRoutingUserPrompt({
          userText: content,
          hasCurrentNote: Boolean(context?.currentNote),
          hasSelectedText: Boolean(context?.selectedText),
          vaultResultCount: context?.vaultResults?.length ?? 0,
          hasAttachments: Boolean(context?.attachments?.length),
          chatMessageCount: this.messages.length
        }),
        signal
      );
      const decision =
        parseLiveDialogueRouteDecision(routerResponse) ??
        fallbackLiveDialogueRoute({ userText: content });

      return decision.route === "smart" ? smartSettings : fastSettings;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      const fallbackDecision = fallbackLiveDialogueRoute({ userText: content });
      return fallbackDecision.route === "smart" ? smartSettings : fastSettings;
    }
  }

  private shouldUseSmartDialogueModel(content: string): boolean {
    const normalized = content.trim().toLowerCase();

    if (normalized.length > 700) {
      return true;
    }

    const lightIntentPattern =
      /\b(кратко|быстро|открой|найди|покажи|перейди|прочитай|привет|hello|hi|short|quick|open|find|show|read)\b/u;
    const heavyIntentPattern =
      /\b(супер\s+детально|очень\s+детально|подробно|глубоко|проанализируй|анализ|исследуй|создай|напиши|измени|обнови|исправь|реализуй|рефактор|архитектур|roadmap|план|код|debug|fix|implement|refactor|architecture|research|deep|detailed)\b/u;

    return heavyIntentPattern.test(normalized) && !lightIntentPattern.test(normalized);
  }

  private async checkSystemHealth(): Promise<void> {
    this.setError(null);
    this.statusEl?.setText("Status: Checking Mindo");

    try {
      const [sttStatus, llmResponse] = await Promise.all([
        this.plugin.getLocalSttStatus(),
        requestLlmChatCompletion(this.plugin.settings, [
          {
            id: `${Date.now()}-health`,
            role: "user",
            content: "Reply with exactly: OK",
            createdAt: Date.now()
          }
        ])
      ]);
      const llmOk = llmResponse.trim().toLowerCase().includes("ok");
      const activeNote = getCurrentNoteLabel(this.app) ?? "none";
      new Notice(
        [
          `LLM: ${llmOk ? "OK" : "responded"}`,
          `STT: ${sttStatus.isRunning ? "running" : "offline"} (${sttStatus.model})`,
          `TTS: ${this.plugin.settings.ttsProvider}`,
          `Active note: ${activeNote}`
        ].join("\n")
      );
      this.statusEl?.setText("Status: Ready");
      void this.refreshSttStatus();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Health check failed");
    }
  }

  private showContexDiagnostics(): void {
    const rust = getRustCoreRuntimeDiagnostics();
    const activeNote = getCurrentNoteLabel(this.app) ?? "none";
    const lines = [
      `Active note: ${activeNote}`,
      `Model: ${this.plugin.settings.model}`,
      `Rust RAG: ${rust.mode}`,
      rust.executablePath ? `Core: ${rust.executablePath}` : "",
      typeof rust.documents === "number" ? `Docs: ${rust.documents}` : "",
      typeof rust.chunks === "number" ? `Chunks: ${rust.chunks}` : "",
      typeof rust.lastIndexMs === "number" ? `Index sync: ${rust.lastIndexMs}ms` : "",
      typeof rust.lastQueryMs === "number" ? `Query: ${rust.lastQueryMs}ms` : "",
      rust.lastError ? `Last error: ${rust.lastError}` : ""
    ].filter(Boolean);

    new Notice(lines.join("\n"), 9000);
  }

  private async sendUserMessage(options?: { liveDialogue?: boolean }): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const content = this.inputEl?.value.trim();

    if (content?.startsWith("/search ")) {
      await this.sendVaultSearch(content.slice("/search ".length).trim());
      return;
    }

    if (content?.startsWith("/web ")) {
      await this.sendWebResearch(content.slice("/web ".length).trim());
      return;
    }

    if (content?.startsWith("/rag ")) {
      await this.sendSemanticVaultQuestion(content.slice("/rag ".length).trim());
      return;
    }

    if (!content) {
      return;
    }

    const outgoingAttachments = this.attachedFiles.length
      ? [...this.attachedFiles]
      : null;
    const userMessage = this.chatController.createUserMessage(
      content,
      this.messages.length,
      outgoingAttachments
    );

    this.messages.push(userMessage);
    this.pendingUserMessageId = userMessage.id;
    this.pendingUserPrompt = content;

    if (this.inputEl) {
      this.inputEl.value = "";
    }

    this.setError(null);
    this.statusEl?.setText("Status: Preparing context");
    this.renderOptimisticUserMessage(userMessage);
    this.setLoading(true);
    void this.renderMessages();

    this.suppressActionReceiptUserContent = true;
    try {
      if (await this.handleLocalCommandText(content)) {
        if (outgoingAttachments) {
          this.attachedFiles = [];
          this.renderAttachedContext();
        }

        if (this.isLoading && !this.activeGenerationAbortController) {
          this.setLoading(false);
        }

        this.pendingUserMessageId = null;
        this.pendingUserPrompt = null;

        if (options?.liveDialogue) {
          await this.continueLiveDialogueAfterLocalAction();
        }

        return;
      }
    } finally {
      this.suppressActionReceiptUserContent = false;
    }

    try {
      const context: LlmRequestContext = {};

      if (options?.liveDialogue) {
        context.liveDialogue = true;
      }

      if (this.useCurrentNote) {
        context.currentNote = (await this.readCurrentNoteContextForRequest()).context;
      }

      const usedAttachedVaultResults = Boolean(this.attachedVaultResults?.length);

      if (this.attachedVaultResults?.length) {
        context.vaultResults = this.attachedVaultResults;
      } else if (this.useVaultSearch && content && !outgoingAttachments?.length) {
        context.vaultResults = await searchSemanticVaultMarkdown(
          this.app,
          content,
          await this.expandSemanticVaultQuery(content),
          8,
          this.plugin.settings
        );
      }

      const usedAttachedFiles = Boolean(outgoingAttachments?.length);

      if (outgoingAttachments?.length) {
        context.attachments = outgoingAttachments;
      }

      await this.sendMessage(
        content,
        hasLlmRequestContext(context) ? context : null,
        false,
        {
          userMessageAlreadyAdded: true,
          liveDialogue: options?.liveDialogue
        }
      );

      if (usedAttachedVaultResults || usedAttachedFiles) {
        this.attachedVaultResults = null;
        this.attachedFiles = [];
        this.renderAttachedContext();
      }
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Error");
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async sendVaultSearch(query: string): Promise<void> {
    if (!query) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: `/search ${query}`,
      createdAt: Date.now()
    };

    this.messages.push(userMessage);

    if (this.inputEl) {
      this.inputEl.value = "";
    }

    this.setError(null);
    this.setLoading(true);

    try {
      const results = await searchVaultMarkdown(this.app, query);
      this.rememberVaultSearch(query, results);
      this.messages.push({
        id: `${Date.now()}-${this.messages.length}`,
        role: "assistant",
        content: formatVaultSearchResults(results),
        createdAt: Date.now(),
        vaultSearchQuery: query,
        vaultSearchResults: results
      });
      this.statusEl?.setText("Status: Ready");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Search failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async sendWebResearch(query: string): Promise<void> {
    if (!query) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: `/web ${query}`,
      createdAt: Date.now()
    };

    this.messages.push(userMessage);

    if (this.inputEl) {
      this.inputEl.value = "";
    }

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Searching web");

    try {
      const searchQuery = await this.rewriteWebResearchQuery(query);
      const response = await searchWeb(this.plugin.settings, searchQuery);
      const results = response.results;
      const content = results.length
        ? await this.summarizeWebResearch(query, results, searchQuery)
        : formatWebSearchResults(
            searchQuery,
            results,
            response.provider,
            response.fallbackReason
          );

      this.messages.push({
        id: `${Date.now()}-${this.messages.length}`,
        role: "assistant",
        content,
        createdAt: Date.now(),
        webResearchQuery: query,
        webSearchQuery: searchQuery,
        webResearchResults: results,
        webResearchProvider: response.provider,
        webResearchFallbackReason: response.fallbackReason,
        webSources: results
      });
      this.statusEl?.setText("Status: Ready");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Web research failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async rewriteWebResearchQuery(query: string): Promise<string> {
    const fallbackQuery = fallbackWebResearchQuery(query);

    try {
      const response = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-web-query-rewrite`,
          role: "user",
          content: [
            "Rewrite this user web research request into one precise search engine query.",
            "Disambiguate 'local LLM' as locally running large language models, not local city news.",
            "Preserve named entities and technical terms.",
            "If the user asks for latest/current/news, include the current year or date.",
            "For news/latest requests, prefer terms like release, announcement, changelog, model release, and official blog over best/guide/roundup.",
            "Return JSON only with this shape:",
            '{"query":"..."}',
            `Current date: ${new Date().toISOString().slice(0, 10)}`,
            "",
            "User request:",
            query
          ].join("\n"),
          createdAt: Date.now()
        }
      ]);
      return parseWebResearchQueryRewrite(response, fallbackQuery);
    } catch (error) {
      console.warn("[Mindo] Web query rewrite failed", error);
      return fallbackQuery;
    }
  }

  private async sendSemanticVaultQuestion(query: string): Promise<void> {
    if (!query) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: `/rag ${query}`,
      createdAt: Date.now()
    };

    this.messages.push(userMessage);

    if (this.inputEl) {
      this.inputEl.value = "";
    }

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Semantic vault search");

    try {
      const variants = await this.expandSemanticVaultQuery(query);
      const results = await searchSemanticVaultMarkdown(
        this.app,
        query,
        variants,
        8,
        this.plugin.settings
      );
      const sectionBundle = results.length
        ? await this.buildSemanticVaultSectionContext(query, results)
        : { context: "", sections: [] };
      const content = results.length
        ? await this.answerSemanticVaultQuestion(
            query,
            results,
            sectionBundle.context
          )
        : `No semantically related notes found for "${query}".`;

      this.rememberVaultSearch(query, results);
      this.messages.push({
        id: `${Date.now()}-${this.messages.length}`,
        role: "assistant",
        content,
        createdAt: Date.now(),
        semanticVaultQuery: query,
        semanticVaultSections: sectionBundle.sections,
        sources: results
      });
      this.statusEl?.setText("Status: Ready");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Semantic search failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async expandSemanticVaultQuery(query: string): Promise<string[]> {
    try {
      const response = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-semantic-query-expansion`,
          role: "user",
          content: [
            "Expand this Obsidian vault search query into short search variants.",
            "Return JSON only with this shape:",
            '{"queries":["...","..."]}',
            "Include synonyms, project names, likely headings, and Russian/English variants when useful.",
            "Keep each query under 8 words.",
            "",
            "Query:",
            query
          ].join("\n"),
          createdAt: Date.now()
        }
      ]);

      return parseSemanticQueryVariants(response);
    } catch (error) {
      console.warn("[Mindo] Semantic query expansion failed", error);
      return [];
    }
  }

  private async answerSemanticVaultQuestion(
    query: string,
    results: VaultSearchResult[],
    sourceContextOverride?: string
  ): Promise<string> {
    const sourceContext =
      sourceContextOverride ||
      (await this.buildSemanticVaultSectionContext(query, results)).context ||
      formatSemanticVaultContext(results);

    return requestLlmChatCompletion(this.plugin.settings, [
      {
        id: `${Date.now()}-semantic-vault-answer`,
        role: "user",
        content: [
          "Answer the user's question using only the provided Obsidian vault sources.",
          "If sources are weak or incomplete, say that clearly.",
          "Use concise Markdown. Include a Sources section with note paths.",
          "Prefer extracted sections over short snippets.",
          "Do not invent facts not present in the sources.",
          "",
          "Question:",
          query,
          "",
          "Vault sources and extracted sections:",
          sourceContext
        ].join("\n"),
        createdAt: Date.now()
      }
    ]);
  }

  private async buildSemanticVaultSectionContext(
    query: string,
    results: VaultSearchResult[]
  ): Promise<{ context: string; sections: VaultSourceSection[] }> {
    const sectionsBySource: string[] = [];
    const sourceSections: VaultSourceSection[] = [];

    for (const [index, result] of results.slice(0, 5).entries()) {
      const file = this.app.vault.getAbstractFileByPath(result.path);

      if (!(file instanceof TFile)) {
        sectionsBySource.push(formatSemanticVaultContext([result]));
        continue;
      }

      const content = await this.app.vault.cachedRead(file);
      const sections = extractRelevantMarkdownSections(content, query, result);
      sections.forEach((section) => {
        sourceSections.push({
          path: result.path,
          title: result.title,
          heading: section.heading,
          excerpt: section.excerpt,
          score: section.score
        });
      });
      const sectionText = sections
        .map((section, sectionIndex) =>
          [
            `Section ${sectionIndex + 1}`,
            `Heading: ${section.heading}`,
            "Excerpt:",
            section.excerpt
          ].join("\n")
        )
        .join("\n\n");

      sectionsBySource.push(
        [
          `Source ${index + 1}`,
          `Path: ${result.path}`,
          `Title: ${result.title}`,
          result.heading ? `Matched heading: ${result.heading}` : "",
          `Score: ${result.score}`,
          sectionText || `Snippet: ${result.snippet}`
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    return {
      context: sectionsBySource.join("\n\n"),
      sections: sourceSections
    };
  }

  private async summarizeWebResearch(
    query: string,
    results: WebSearchResult[],
    searchQuery?: string
  ): Promise<string> {
    return requestLlmChatCompletion(this.plugin.settings, [
      {
        id: `${Date.now()}-web-research-summary`,
        role: "user",
        content: [
          "Use the provided web search results to answer the user's research question.",
          "Be concise, factual, and explicit about uncertainty.",
          "Include a short Sources section with Markdown links.",
          "Do not invent facts that are not supported by the snippets.",
          "Use the source Type and Quality notes to distinguish direct news/releases from guides, SEO roundups, docs, and background references.",
          "If the user asked for latest/news but sources are mostly guides or roundups, say that clearly before summarizing.",
          `Date checked: ${new Date().toISOString().slice(0, 10)}`,
          "",
          "Question:",
          query,
          searchQuery && searchQuery !== query ? `Search query: ${searchQuery}` : "",
          "",
          "Search results:",
          formatWebSearchContext(results)
        ].join("\n"),
        createdAt: Date.now()
      }
    ]);
  }

  private async buildAutoWebContextForRequest(
    userRequest: string,
    context?: LlmRequestContext | null
  ): Promise<AutoWebContext | null> {
    if (isLocalOnlyCommandText(userRequest)) {
      return null;
    }

    const workflowPlan = planContextWorkflow(userRequest);
    const decision =
      decideAutoWebResearch(userRequest, context) ??
      (workflowPlan.requiresWeb
        ? {
            query: buildAutoWebResearchQuery(userRequest, context),
            reason: workflowPlan.reason
          }
        : null);

    if (!decision) {
      return null;
    }

    if (!this.plugin.settings.webSearchEnabled) {
      return null;
    }

    try {
      this.statusEl?.setText("Status: Checking current web");
      this.pushActionTimeline("searching", "Checking current web", decision.query);
      const searchQuery = await this.rewriteWebResearchQuery(decision.query);
      const response = await searchWeb(this.plugin.settings, searchQuery);

      if (!response.results.length) {
        this.pushActionTimeline("done", "Web search returned no results", searchQuery);
        return null;
      }

      return {
        query: decision.query,
        searchQuery,
        reason: decision.reason,
        provider: response.provider,
        fallbackReason: response.fallbackReason,
        results: response.results
      };
    } catch (error) {
      this.pushActionTimeline(
        "failed",
        "Auto web research failed",
        this.getErrorMessage(error)
      );
      console.warn("[Mindo] Auto web research failed", error);
      return null;
    }
  }

  private attachAutoWebContext(
    context: LlmRequestContext | null,
    webContext: AutoWebContext | null
  ): LlmRequestContext | null {
    if (!webContext) {
      return context;
    }

    return {
      ...(context ?? {}),
      webResults: webContext.results,
      webResearchQuery: webContext.query,
      webSearchQuery: webContext.searchQuery,
      webResearchProvider: webContext.provider,
      webResearchFallbackReason: webContext.fallbackReason,
      webResearchReason: webContext.reason
    };
  }

  private async attachProjectMemoryContext(
    context: LlmRequestContext | null
  ): Promise<LlmRequestContext | null> {
    if (context?.projectMemory?.trim()) {
      return context;
    }

    const projectMemory = await this.readProjectMemoryContext();

    if (!projectMemory) {
      return context;
    }

    return {
      ...(context ?? {}),
      projectMemory
    };
  }

  private async readProjectMemoryContext(): Promise<string | null> {
    const memoryFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => isProjectMemoryFile(file.path))
      .sort((left, right) => right.stat.mtime - left.stat.mtime)
      .slice(0, 6);

    if (!memoryFiles.length) {
      return null;
    }

    const chunks: string[] = [];
    let remainingChars = MAX_PROJECT_MEMORY_CONTEXT_CHARS;

    for (const file of memoryFiles) {
      if (remainingChars <= 0) {
        break;
      }

      try {
        const content = await this.app.vault.cachedRead(file);
        const excerpt = trimTextForContext(content, Math.min(1600, remainingChars));

        if (!excerpt) {
          continue;
        }

        const chunk = [`Memory source: ${file.path}`, excerpt].join("\n");
        chunks.push(chunk);
        remainingChars -= chunk.length;
      } catch (error) {
        console.warn("[Mindo] Could not read project memory", file.path, error);
      }
    }

    return chunks.length ? chunks.join("\n\n---\n\n") : null;
  }

  private async sendNoteAction(prompt: string): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const contextResult = await this.readCurrentNoteContextForRequest();

    if (!contextResult.context) {
      this.setError("Open a Markdown note before using note actions.");
      this.statusEl?.setText("Status: No current note");
      return;
    }

    this.useCurrentNote = true;

    if (this.useCurrentNoteEl) {
      this.useCurrentNoteEl.checked = true;
    }

    this.refreshContextStatus();
    await this.sendMessage(prompt, { currentNote: contextResult.context }, false);
  }

  private async sendSelectedTextAction(
    prompt: string,
    selectedTextContextOverride?: SelectedTextContext | null
  ): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const contextResult = selectedTextContextOverride
      ? {
          context: selectedTextContextOverride,
          warning: null
        }
      : this.readSelectedTextContextForRequest();

    if (!contextResult.context) {
      this.setError(contextResult.warning);
      this.statusEl?.setText("Status: No selected text");
      return;
    }

    await this.sendMessage(
      prompt,
      { selectedText: contextResult.context },
      false
    );
    this.hideSelectionToolbar();
  }

  private async sendSelectedTextImprovement(
    selectedTextContextOverride?: SelectedTextContext | null
  ): Promise<void> {
    const action = SELECTED_TEXT_ACTIONS.find(
      (selectedAction) => selectedAction.kind === "improve-selection"
    );

    await this.sendSelectedTextDiffAction(
      action,
      selectedTextContextOverride,
      "Improve selection preview",
      "improve-selection",
      { allowWhileLoading: true }
    );
  }

  private async sendSelectedTextDiffAction(
    action: NoteAction | undefined,
    selectedTextContextOverride: SelectedTextContext | null | undefined,
    previewTitle: string,
    operationType: string,
    options: { allowWhileLoading?: boolean } = {}
  ): Promise<void> {
    if (this.isLoading && !options.allowWhileLoading) {
      return;
    }

    const contextResult = selectedTextContextOverride
      ? {
          context: selectedTextContextOverride,
          warning: null
        }
      : this.readSelectedTextContextForRequest();

    if (!action || !contextResult.context) {
      this.setError(
        contextResult.warning ?? "Select text before using this action."
      );
      this.statusEl?.setText("Status: No selected text");
      return;
    }

    await this.sendMessage(
      action.prompt,
      { selectedText: contextResult.context },
      false,
      {
        diffPreviewOriginal: contextResult.context.text,
        diffPreviewTitle: previewTitle,
        diffOperationType: operationType,
        diffUserPrompt: action.prompt
      }
    );
    this.hideSelectionToolbar();
  }

  private async createNoteFromSelection(
    selectedTextContextOverride?: SelectedTextContext | null
  ): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const contextResult = selectedTextContextOverride
      ? {
          context: selectedTextContextOverride,
          warning: null
        }
      : this.readSelectedTextContextForRequest();

    if (!contextResult.context) {
      this.setError(contextResult.warning);
      this.statusEl?.setText("Status: No selected text");
      return;
    }

    const selectedContext = contextResult.context;
    this.hideSelectionToolbar();
    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Drafting note");

    try {
      const proposalText = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-create-note`,
          role: "user",
          content: buildCreateNoteFromSelectionPrompt(contextResult.context.text),
          createdAt: Date.now()
        }
      ]);
      const proposal = await this.prepareCreateNoteProposal(proposalText);

      new CreateNoteModal(this.app, {
        proposal,
        onApply: async (editedProposal) => {
          await this.applyCreateNoteProposal(
            editedProposal,
            selectedContext
          );
        },
        onChange: async (currentProposal, instruction) => {
          return this.refineCreateNoteProposal(
            currentProposal,
            selectedContext,
            instruction
          );
        }
      }).open();
      this.appendActionReceipt({
        status: "preview",
        label: "Drafted note proposal",
        detail: proposal.path
      });
      this.statusEl?.setText("Status: Ready");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Create note failed");
    } finally {
      this.setLoading(false);
    }
  }

  private async createNoteFromCommand(commandText: string): Promise<void> {
    await this.createNoteFromCommandText(commandText, commandText);
  }

  private createStreamingGeneratedNoteDeps() {
    return {
      app: this.app,
      settings: this.plugin.settings,
      setStatus: (text: string) => {
        this.statusEl?.setText(text);
      },
      openVaultPath: (path: string, noticeMessage: string) =>
        this.openVaultPath(path, noticeMessage),
      appendActionReceipt: (
        receipt: ActionReceipt,
        userContent?: string,
        userAttachments?: LlmFileAttachment[] | null
      ) => {
        this.appendActionReceipt(receipt, userContent, userAttachments);
      },
      pushActionTimeline: (
        type: "running" | "done",
        label: string,
        detail?: string,
        path?: string
      ) => {
        this.pushActionTimeline(type, label, detail, path);
      }
    };
  }

  private async createNoteFromCommandText(
    commandText: string,
    displayCommandText: string
  ): Promise<void> {
    const sourceContext: SelectedTextContext = {
      path: "Mindo Command",
      name: "Mindo Command",
      text: commandText,
      isTruncated: false,
      originalLength: commandText.length,
      includedLength: commandText.length
    };
    const activeNote = await this.readActiveMarkdownNote();
    const targetFolder = this.resolveCreateNoteTargetFolder(
      commandText,
      activeNote?.file.path
    );
    const attachedFiles = this.attachedFiles.length
      ? [...this.attachedFiles]
      : null;

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Drafting note");

    try {
      const activeNoteContext = activeNote
        ? this.buildSelectedContextFromNote(activeNote.file, activeNote.content)
        : null;
      const projectMemory = await this.readProjectMemoryContext();
      const contextForResearchDecision: LlmRequestContext = {};

      if (activeNoteContext) {
        contextForResearchDecision.selectedText = activeNoteContext;
      }

      if (projectMemory) {
        contextForResearchDecision.projectMemory = projectMemory;
      }

      if (attachedFiles) {
        contextForResearchDecision.attachments = attachedFiles;
      }

      const autoWebContext = await this.buildAutoWebContextForRequest(
        commandText,
        hasLlmRequestContext(contextForResearchDecision)
          ? contextForResearchDecision
          : null
      );
      const title = inferResearchNoteTitle(commandText);
      await createStreamingGeneratedNoteFile(
        this.createStreamingGeneratedNoteDeps(),
        {
          title,
          targetFolder,
          selectedContext: sourceContext,
          userPrompt: commandText,
          userContent: displayCommandText,
          userAttachments: attachedFiles,
          requestContext: attachedFiles
            ? {
                attachments: attachedFiles
              }
            : null,
          webSources: autoWebContext?.results,
          draftLabel: "Drafting note",
          savedLabel: "Created note",
          prompt: buildCreateNoteFromCommandPrompt({
            title,
            targetFolder,
            commandText,
            autoWebContextText: autoWebContext
              ? formatAutoWebContextForPrompt(autoWebContext)
              : "",
            projectMemoryText: projectMemory
              ? formatProjectMemoryForPrompt(projectMemory)
              : "",
            activeNotePath: activeNote?.file.path ?? null,
            activeNoteExcerpt:
              activeNote?.content.slice(0, MAX_NOTE_ACTION_CONTEXT_CHARS) ?? "",
            hasAttachments: Boolean(attachedFiles)
          })
        }
      );
      this.statusEl?.setText("Status: Note created");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Create note failed");
    } finally {
      if (attachedFiles) {
        this.attachedFiles = [];
        this.renderAttachedContext();
      }

      this.setLoading(false);
    }
  }

  private async createResearchNoteFromCommandText(
    commandText: string,
    displayCommandText: string
  ): Promise<void> {
    const activeNote = await this.readActiveMarkdownNote();
    const targetFolder = this.resolveCreateNoteTargetFolder(
      commandText,
      activeNote?.file.path
    );
    const attachedFiles = this.attachedFiles.length
      ? [...this.attachedFiles]
      : null;
    const sourceContext: SelectedTextContext = {
      path: "Mindo Research Workflow",
      name: "Mindo Research Workflow",
      text: commandText,
      isTruncated: false,
      originalLength: commandText.length,
      includedLength: commandText.length
    };

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Research workflow");

    try {
      console.debug("[Mindo] Research workflow started", {
        commandText,
        targetFolder,
        activePath: activeNote?.file.path ?? null
      });

      const activeNoteContext = activeNote
        ? this.buildSelectedContextFromNote(activeNote.file, activeNote.content)
        : null;
      const projectMemory = await this.readProjectMemoryContext();
      const vaultVariants = await this.expandSemanticVaultQuery(commandText);
      const vaultResults = await searchSemanticVaultMarkdown(
        this.app,
        commandText,
        vaultVariants,
        8,
        this.plugin.settings
      );
      const sectionBundle = vaultResults.length
        ? await this.buildSemanticVaultSectionContext(commandText, vaultResults)
        : { context: "", sections: [] };
      const researchContext: LlmRequestContext = activeNoteContext
        ? {
            selectedText: activeNoteContext,
            vaultResults,
            projectMemory
          }
        : {
            vaultResults,
            projectMemory
          };

      if (attachedFiles) {
        researchContext.attachments = attachedFiles;
      }

      const webContext = await this.buildResearchWorkflowWebContext(
        commandText,
        researchContext
      );

      this.rememberVaultSearch(commandText, vaultResults);
      this.appendWorkflowReceipt(
        {
          status: "done",
          label: "Workflow sources",
          detail: [
            vaultResults.length ? `${vaultResults.length} vault` : "0 vault",
            webContext?.results.length
              ? `${webContext.results.length} web`
              : this.plugin.settings.webSearchEnabled
                ? "0 web"
                : "web off"
          ].join(" | ")
        },
        displayCommandText
      );

      const workflowSourceText = buildResearchWorkflowSourceText({
        commandText,
        vaultSourceText: vaultResults.length
          ? formatSemanticVaultContext(vaultResults).slice(
              0,
              MAX_RESEARCH_NOTE_SOURCE_CHARS
            )
          : "(none)",
        webSourceText: webContext?.results.length
          ? formatWebSearchContext(webContext.results).slice(
              0,
              MAX_RESEARCH_NOTE_SOURCE_CHARS
            )
          : "(none)"
      });

      const title = inferResearchNoteTitle(commandText);
      await createStreamingGeneratedNoteFile(
        this.createStreamingGeneratedNoteDeps(),
        {
          title,
          targetFolder,
          selectedContext: {
            ...sourceContext,
            text: workflowSourceText,
            originalLength: workflowSourceText.length,
            includedLength: workflowSourceText.length
          },
          userPrompt: commandText,
          userContent: displayCommandText,
          userAttachments: attachedFiles,
          requestContext: attachedFiles
            ? {
                attachments: attachedFiles
              }
            : null,
          vaultSources: vaultResults,
          webSources: webContext?.results,
          draftLabel: "Research note preview",
          savedLabel: "Created research note",
          prompt: buildResearchNotePrompt({
            title,
            commandText,
            targetFolder,
            projectMemoryText: projectMemory
              ? formatProjectMemoryForPrompt(projectMemory)
              : "",
            activeNoteContextText: activeNote
              ? [
                  "Active note context:",
                  `Path: ${activeNote.file.path}`,
                  activeNote.content.slice(0, MAX_NOTE_ACTION_CONTEXT_CHARS)
                ].join("\n")
              : "",
            vaultContextText:
              sectionBundle.context || formatSemanticVaultContext(vaultResults),
            webContextText: webContext ? formatAutoWebContextForPrompt(webContext) : "",
            hasVaultResults: Boolean(vaultResults.length),
            hasAttachments: Boolean(attachedFiles),
            dateChecked: new Date().toISOString().slice(0, 10)
          })
        }
      );
      this.statusEl?.setText("Status: Research note created");
    } catch (error) {
      console.warn("[Mindo] Research workflow failed", error);
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Research workflow failed");
      this.appendWorkflowReceipt({
        status: "failed",
        label: "Workflow failed",
        detail: this.getErrorMessage(error)
      });
    } finally {
      if (attachedFiles) {
        this.attachedFiles = [];
        this.renderAttachedContext();
      }

      this.setLoading(false);
    }
  }

  private async buildResearchWorkflowWebContext(
    commandText: string,
    context: LlmRequestContext | null
  ): Promise<AutoWebContext | null> {
    const autoWebContext = await this.buildAutoWebContextForRequest(
      commandText,
      context
    );

    if (autoWebContext) {
      return autoWebContext;
    }

    if (
      !this.plugin.settings.webSearchEnabled ||
      !shouldUseWebForResearchWorkflow(commandText)
    ) {
      return null;
    }

    try {
      this.statusEl?.setText("Status: Researching web");
      const query = buildAutoWebResearchQuery(commandText, context);
      const searchQuery = await this.rewriteWebResearchQuery(query);
      const response = await searchWeb(this.plugin.settings, searchQuery);

      if (!response.results.length) {
        return null;
      }

      return {
        query,
        searchQuery,
        reason:
          "Research workflow used web context because the task appears to depend on current technologies, tools, or recommendations.",
        provider: response.provider,
        fallbackReason: response.fallbackReason,
        results: response.results
      };
    } catch (error) {
      console.warn("[Mindo] Research workflow web lookup failed", error);
      return null;
    }
  }

  private async prepareResearchNoteProposal(
    proposalText: string,
    targetFolder: string,
    commandText: string
  ): Promise<CreateNoteProposal> {
    const parsed = parseCreateNoteProposalText(proposalText);
    const title =
      sanitizeResearchTitle(parsed.title) ||
      inferResearchNoteTitle(commandText) ||
      "Mindo Research Note";
    const path = await getUniqueNotePath(
      this.app,
      `${normalizePath(targetFolder).replace(/^\/+/, "")}/${slugifyTitle(title)}.md`
    );
    const rawContent = parsed.content ?? "";
    const content = stripDuplicateLeadingTitle(
      stripHiddenTtsHints(rawContent),
      title,
      path
    );

    return {
      path,
      content
    };
  }

  private async refineResearchNoteProposal(
    proposal: CreateNoteProposal,
    commandText: string,
    sourceText: string,
    targetFolder: string,
    instruction: string
  ): Promise<CreateNoteProposal> {
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction) {
      return proposal;
    }

    this.setError(null);
    this.statusEl?.setText("Status: Refining research note");

    try {
      const proposalText = await requestLlmChatCompletion(
        this.plugin.settings,
        [
          {
            id: `${Date.now()}-refine-research-note`,
            role: "user",
            content: buildRefineResearchNotePrompt({
              commandText,
              sourceText,
              currentContent: proposal.content,
              instruction: trimmedInstruction
            }),
            createdAt: Date.now()
          }
        ]
      );

      return this.prepareResearchNoteProposal(
        proposalText,
        targetFolder,
        commandText
      );
    } finally {
      this.statusEl?.setText("Status: Ready");
    }
  }

  private resolveCreateNoteTargetFolder(
    commandText: string,
    activePath?: string
  ): string {
    const requestedFolder = extractRequestedFolderName(commandText);

    if (requestedFolder) {
      return this.resolveVaultFolderPath(requestedFolder) ?? requestedFolder;
    }

    const activeFolder = activePath ? getFolderPath(activePath) : "";

    return activeFolder || "Mindo Inbox";
  }

  private resolveVaultFolderPath(folderQuery: string): string | null {
    const normalizedQuery = normalizeOpenFileValue(folderQuery);

    if (!normalizedQuery) {
      return null;
    }

    const folders = Array.from(
      new Set(
        this.app.vault
          .getMarkdownFiles()
          .map((file) => getFolderPath(file.path))
          .filter(Boolean)
      )
    );
    const scoredFolders = folders
      .map((folder) => ({
        folder,
        score: scoreVaultFolderCandidate(folder, normalizedQuery)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    return scoredFolders[0]?.folder ?? null;
  }

  private async placeCreateNoteProposalInFolder(
    proposal: CreateNoteProposal,
    folder: string
  ): Promise<CreateNoteProposal> {
    const normalizedFolder = normalizePath(folder).replace(/^\/+/, "");
    const rawPath = normalizePath(proposal.path).replace(/^\/+/, "");
    const filename = sanitizeCreateNoteFilename(
      rawPath.split("/").pop(),
      proposal.content
    );
    const path = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;

    return {
      ...proposal,
      path: await getUniqueNotePath(this.app, path)
    };
  }

  private async createNoteFromCurrentNote(options: {
    fallbackFolder: string;
    modalTitle: string;
    promptLines: string[];
    statusText: string;
    userPrompt: string;
  }): Promise<void> {
    if (this.isLoading) {
      return;
    }

    const note = await this.readActiveMarkdownNote();

    if (!note) {
      this.setError("Open a Markdown note before using this action.");
      this.statusEl?.setText("Status: No current note");
      return;
    }

    const sourceContext = this.buildSelectedContextFromNote(
      note.file,
      note.content
    );

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText(options.statusText);

    try {
      const projectMemory = await this.readProjectMemoryContext();
      const proposalText = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-${slugifyTitle(options.userPrompt)}`,
          role: "user",
          content: buildCurrentNoteCreatePrompt({
            promptLines: options.promptLines,
            projectMemoryText: projectMemory
              ? formatProjectMemoryForPrompt(projectMemory)
              : "",
            currentNotePath: note.file.path,
            currentNoteContent: sourceContext.text
          }),
          createdAt: Date.now()
        }
      ]);
      const proposal = await this.prepareCreateNoteProposal(
        proposalText,
        options.fallbackFolder
      );

      await this.applyCreateNoteProposal(
        proposal,
        sourceContext,
        options.userPrompt,
        options.userPrompt
      );
      this.statusEl?.setText("Status: Note created");
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Draft failed");
    } finally {
      this.setLoading(false);
    }
  }

  private async prepareCreateNoteProposal(
    proposalText: string,
    fallbackFolder = "Mindo Inbox"
  ): Promise<CreateNoteProposal> {
    const parsed = parseCreateNoteProposalText(proposalText);
    const title = parsed.title || "Mindo Note";
    const requestedPath = isSafeCreateNotePath(parsed.path)
      ? parsed.path
      : `${fallbackFolder}/${slugifyTitle(title)}.md`;
    const path = await getUniqueNotePath(this.app, requestedPath);
    const rawContent = parsed.content ?? proposalText.trim();
    const content = stripDuplicateLeadingTitle(
      stripHiddenTtsHints(rawContent),
      title,
      path
    );

    return {
      path,
      content
    };
  }

  private async refineCreateNoteProposal(
    proposal: CreateNoteProposal,
    selectedContext: SelectedTextContext,
    instruction: string
  ): Promise<CreateNoteProposal> {
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction) {
      return proposal;
    }

    this.setError(null);
    this.statusEl?.setText("Status: Updating note draft");

    try {
      const proposalText = await requestLlmChatCompletion(
        this.plugin.settings,
        [
          {
            id: `${Date.now()}-refine-note`,
            role: "user",
            content: buildRefineCreateNotePrompt({
              selectedSourceText: selectedContext.text,
              currentPath: proposal.path,
              currentContent: proposal.content,
              instruction: trimmedInstruction
            }),
            createdAt: Date.now()
          }
        ]
      );

      return await this.prepareCreateNoteProposal(proposalText);
    } finally {
      this.statusEl?.setText("Status: Ready");
    }
  }

  private async refineCurrentNoteProposal(
    proposal: CreateNoteProposal,
    sourceContext: SelectedTextContext,
    instruction: string,
    options: {
      fallbackFolder: string;
      promptLines: string[];
    }
  ): Promise<CreateNoteProposal> {
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction) {
      return proposal;
    }

    this.setError(null);
    this.statusEl?.setText("Status: Updating note draft");

    try {
      const proposalText = await requestLlmChatCompletion(
        this.plugin.settings,
        [
          {
            id: `${Date.now()}-refine-current-note-draft`,
            role: "user",
            content: buildRefineCurrentNotePrompt({
              fallbackFolder: options.fallbackFolder,
              sourcePath: sourceContext.path,
              sourceContent: sourceContext.text,
              currentPath: proposal.path,
              currentContent: proposal.content,
              instruction: trimmedInstruction
            }),
            createdAt: Date.now()
          }
        ]
      );

      return await this.prepareCreateNoteProposal(
        proposalText,
        options.fallbackFolder
      );
    } finally {
      this.statusEl?.setText("Status: Ready");
    }
  }

  private async applyCreateNoteProposal(
    proposal: CreateNoteProposal,
    selectedContext: SelectedTextContext,
    userPrompt = "Create note from selection",
    userContent?: string,
    userAttachments?: LlmFileAttachment[] | null
  ): Promise<string> {
    const path = await getUniqueNotePath(this.app, proposal.path);
    const content = proposal.content.trim();

    if (!content) {
      throw new Error("New note content is empty.");
    }

    assertWritableVaultPath(path, this.app.vault.configDir);
    await ensureFolderForPath(this.app, path);
    this.pushActionTimeline("running", "Creating note", path, path);

    const operation = await recordAiChangeOperation(this.app, {
      operationType: "create-note",
      filePath: path,
      beforeContent: "",
      afterContent: content,
      selectedBefore: selectedContext.text,
      selectedAfter: content,
      model: this.plugin.settings.model,
      userPrompt
    });

    await this.app.vault.create(path, content);
    await markAiChangeOperationApplied(this.app, operation.id);
    new Notice(`Created note: ${path}`);
    await this.openVaultPath(path, `Created and opened note: ${path}`);
    this.appendActionReceipt({
      status: "saved",
      label: "Created note",
      detail: path,
      path
    }, userContent, userAttachments);
    this.pushActionTimeline("done", "Created note", path, path);
    return path;
  }

  private async sendMessage(
    content: string | undefined,
    context: LlmRequestContext | null,
    clearInput = true,
    options?: {
      diffPreviewOriginal?: string;
      diffPreviewTitle?: string;
      diffOperationType?: string;
      diffUserPrompt?: string;
      userMessageAlreadyAdded?: boolean;
      liveDialogue?: boolean;
    }
  ): Promise<void> {
    if (!content) {
      return;
    }

    if (!options?.userMessageAlreadyAdded) {
      const userMessage: ChatMessage = {
        id: `${Date.now()}-${this.messages.length}`,
        role: "user",
        content,
        createdAt: Date.now(),
        attachments: context?.attachments?.length ? context.attachments : null
      };

      this.messages.push(userMessage);
      this.pendingUserMessageId = userMessage.id;
      this.pendingUserPrompt = content;

      if (clearInput && this.inputEl) {
        this.inputEl.value = "";
      }

      this.setError(null);
      void this.renderMessages();
    } else {
      const pendingUserMessage = findLatestUserMessage(this.messages);
      this.pendingUserMessageId = pendingUserMessage?.id ?? null;
      this.pendingUserPrompt = content;
    }

    this.setLoading(true);
    const liveDialogueContext: LlmRequestContext | null = options?.liveDialogue
      ? {
          ...(context ?? {}),
          liveDialogue: true
        }
      : context;
    const contextWithMemory = await this.attachProjectMemoryContext(liveDialogueContext);
    const autoWebContext = await this.buildAutoWebContextForRequest(
      content,
      contextWithMemory
    );
    const requestContext = this.attachAutoWebContext(
      contextWithMemory,
      autoWebContext
    );
    const abortController = new AbortController();
    this.activeGenerationAbortController = abortController;
    const llmSettings = options?.liveDialogue
      ? await this.getLiveDialogueLlmSettings(
          content,
          requestContext,
          abortController.signal
        )
      : this.plugin.settings;

    let liveAssistantMessage: ChatMessage | null = null;
    let shouldContinueLiveDialogue = false;
    let liveSpeechQueue: StreamingSpeechQueue | null = null;
    let usedLiveStreamingSpeech = false;
    let liveAssistantMessageId: string | null = null;
    let autoApplyMessageId: string | null = null;

    try {
      const requestMessages = [...this.messages];
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-${this.messages.length}`,
        role: "assistant",
        content: "",
        createdAt: Date.now()
      };

      this.messages.push(assistantMessage);
      liveAssistantMessageId = assistantMessage.id;
      this.streamingMessageId = assistantMessage.id;
      void this.renderMessages();

      if (options?.liveDialogue) {
        this.statusEl?.setText("Status: Thinking");
        liveSpeechQueue = this.createLiveStreamingSpeechQueue(
          assistantMessage.id
        );
        usedLiveStreamingSpeech = Boolean(liveSpeechQueue);
        await liveSpeechQueue?.warm();
        void this.playLiveDialogueAcknowledgement("thinking");
      }

      try {
        const streamedContent = await streamLlmChatCompletion(
          llmSettings,
          requestMessages,
          requestContext,
          (token) => {
            if (abortController.signal.aborted) {
              return;
            }

            assistantMessage.content += token;
            liveSpeechQueue?.pushToken(token);
            this.queueRenderMessages();
          },
          abortController.signal
        );

        if (abortController.signal.aborted) {
          throw new Error("Mindo generation canceled.");
        }

        if (streamedContent.trim()) {
          assistantMessage.content = streamedContent;
        }
      } catch (streamError) {
        if (assistantMessage.content.trim()) {
          throw streamError;
        }

        this.statusEl?.setText("Status: Streaming unavailable, waiting for LLM");
        assistantMessage.content = await requestLlmChatCompletion(
          llmSettings,
          requestMessages,
          requestContext
        );
        liveSpeechQueue?.pushToken(assistantMessage.content);

        if (abortController.signal.aborted) {
          throw new Error("Mindo generation canceled.");
        }
      }

      if (!assistantMessage.content.trim()) {
        assistantMessage.content = await requestLlmChatCompletion(
          llmSettings,
          requestMessages,
          requestContext
        );
        liveSpeechQueue?.pushToken(assistantMessage.content);

        if (abortController.signal.aborted) {
          throw new Error("Mindo generation canceled.");
        }
      }

      if (options?.diffPreviewOriginal) {
        assistantMessage.content = cleanSuggestedReplacement(
          assistantMessage.content
        );
        const sourcePath = requestContext?.selectedText?.path ?? "";
        const sourceFile = sourcePath
          ? this.app.vault.getAbstractFileByPath(sourcePath)
          : null;
        const sourceContent =
          sourceFile instanceof TFile ? await this.app.vault.read(sourceFile) : "";
        assistantMessage.diffPreview = {
          title: options.diffPreviewTitle ?? "Improve selection preview",
          sourcePath,
          originalOccurrenceIndex: getUniqueOccurrenceIndex(
            sourceContent,
            options.diffPreviewOriginal
          ),
          original: options.diffPreviewOriginal,
          suggested: assistantMessage.content,
          status: "pending",
          operationType: options.diffOperationType ?? "improve-selection",
          userPrompt: options.diffUserPrompt ?? content
        };
        void this.showInlineDiffForMessage(assistantMessage.id);
        autoApplyMessageId = assistantMessage.id;
      }

      if (requestContext?.vaultResults?.length) {
        assistantMessage.sources = requestContext.vaultResults;
        this.rememberVaultSearch(content, requestContext.vaultResults);
      }

      if (requestContext?.webResults?.length) {
        assistantMessage.webResearchQuery =
          requestContext.webResearchQuery ?? content;
        assistantMessage.webSearchQuery =
          requestContext.webSearchQuery ?? requestContext.webResearchQuery ?? content;
        assistantMessage.webResearchResults = requestContext.webResults;
        assistantMessage.webResearchProvider =
          requestContext.webResearchProvider ?? undefined;
        assistantMessage.webResearchFallbackReason =
          requestContext.webResearchFallbackReason ?? undefined;
        assistantMessage.webSources = requestContext.webResults;
      }

      void this.recordWikiAutopilotMemory({
        userText: content,
        assistantText: assistantMessage.content,
        sourcePaths: requestContext?.vaultResults?.map((source) => source.path),
        webSources: requestContext?.webResults ?? undefined
      });

      if (liveSpeechQueue) {
        await liveSpeechQueue.finish();
        if (this.liveSpeechQueue === liveSpeechQueue) {
          this.liveSpeechQueue = null;
        }
        this.finishSpeaking(assistantMessage.id);
      }

      this.streamingMessageId = null;
      this.statusEl?.setText("Status: Ready");
      liveAssistantMessage = assistantMessage;
      shouldContinueLiveDialogue = Boolean(options?.liveDialogue);
    } catch (error) {
      if (liveSpeechQueue) {
        liveSpeechQueue.cancel();
        if (this.liveSpeechQueue === liveSpeechQueue) {
          this.liveSpeechQueue = null;
        }
      }

      if (this.speakingMessageId === liveAssistantMessageId) {
        this.stopSpeaking();
      }

      this.streamingMessageId = null;
      this.removeEmptyAssistantMessages();
      if (isGenerationCanceledError(error)) {
        this.setError(null);
        this.statusEl?.setText("Status: Canceled");
      } else {
        this.setError(this.getErrorMessage(error));
        this.statusEl?.setText("Status: Error");
      }
    } finally {
      const isCurrentGeneration =
        this.activeGenerationAbortController === abortController;

      if (isCurrentGeneration) {
        this.activeGenerationAbortController = null;
        this.pendingUserMessageId = null;
        this.pendingUserPrompt = null;
        this.setLoading(false);
        void this.renderMessages();
        if (autoApplyMessageId) {
          this.queueAutoApplyDiffPreview(autoApplyMessageId);
        }
      }

      if (
        isCurrentGeneration &&
        shouldContinueLiveDialogue &&
        liveAssistantMessage &&
        this.isLiveDialogueSessionActive
      ) {
        if (usedLiveStreamingSpeech) {
          await this.startLiveDialogueListening();
        } else {
          await this.continueLiveDialogueWithMessage(liveAssistantMessage);
        }
      }
    }

    // TODO: Future milestones will add image support and deeper vault edit workflows.
  }

  private async renderMessages(): Promise<void> {
    if (!this.chatEl) {
      return;
    }

    this.refreshConversationChrome();
    const renderSequence = ++this.renderSequence;
    const sourcePath = getCurrentNoteLabel(this.app) ?? "";
    const shouldStickToBottom =
      this.shouldAutoScrollChat || this.isChatNearBottom();
    const previousScrollTop = this.chatEl.scrollTop;
    this.chatEl.empty();

    for (const message of this.messages) {
      if (renderSequence !== this.renderSequence) {
        return;
      }

      const isStreamingPlaceholder =
        message.role === "assistant" &&
        this.isLoading &&
        message.id === this.streamingMessageId &&
        !message.content.trim();
      const messageClasses = [
        "contex-agent__message",
        `contex-agent__message--${message.role}`
      ];

      if (message.actionReceipt) {
        messageClasses.push("contex-agent__message--receipt");
      }

      if (message.sources?.length || message.webSources?.length) {
        messageClasses.push("contex-agent__message--with-sources");
      }

      const messageEl = this.chatEl.createDiv({
        cls: messageClasses
      });

      const messageHeaderEl = messageEl.createDiv({
        cls: "contex-agent__message-header"
      });
      messageHeaderEl.createDiv({
        cls: "contex-agent__message-role",
        text: formatChatMessageRoleLabel(message.role)
      });

      if (this.canSpeakMessage(message)) {
        const speakButton = messageHeaderEl.createEl("button", {
          cls: "contex-agent__message-action",
          attr: {
            type: "button",
            "aria-label":
              this.speakingMessageId === message.id
                ? "Stop reading"
                : "Read answer"
          }
        });
        setIcon(
          speakButton,
          this.speakingMessageId === message.id ? "square" : "volume-2"
        );
        speakButton.addEventListener("click", () => {
          void this.toggleSpeakMessage(message);
        });
      }

      const contentEl = messageEl.createDiv({
        cls: "contex-agent__message-content"
      });

      if (isStreamingPlaceholder) {
        this.renderTypingIndicator(contentEl);
      } else if (message.webResearchResults) {
        await this.renderWebResearchMessage(contentEl, message);
      } else if (message.vaultSearchResults) {
        this.renderVaultSearchResults(contentEl, message);
      } else if (message.diffPreview) {
        this.renderDiffPreview(contentEl, message);
      } else if (message.actionReceipt) {
        this.renderActionReceipt(contentEl, message.actionReceipt);
      } else if (message.role === "assistant" && message.content.trim()) {
        contentEl.addClass("markdown-rendered");
        await MarkdownRenderer.render(
          this.app,
          stripHiddenTtsHints(message.content),
          contentEl,
          sourcePath,
          this
        );
        if (message.sources?.length) {
          this.renderAnswerSources(
            contentEl,
            message.sources,
            message.semanticVaultSections ?? []
          );
        }
        if (message.webSources?.length) {
          this.renderInlineWebSources(contentEl, message.webSources);
        }
      } else {
        contentEl.addClass("contex-agent__message-content--plain");

        contentEl.setText(message.content || "...");
      }

      if (message.attachments?.length) {
        renderMessageAttachments(messageEl, message.attachments, setIcon);
      }
    }

    if (renderSequence !== this.renderSequence) {
      return;
    }

    if (shouldStickToBottom) {
      this.chatEl.scrollTop = this.chatEl.scrollHeight;
      this.shouldAutoScrollChat = true;
    } else {
      this.chatEl.scrollTop = previousScrollTop;
      this.shouldAutoScrollChat = false;
    }
    this.updateActiveChatTitle();
    this.refreshChatSelect();
    this.renderSuggestions();
    this.refreshLiveDialogueSurface();
    this.queuePersistChatState();
  }

  private renderOptimisticUserMessage(message: ChatMessage): void {
    if (!this.chatEl) {
      return;
    }

    this.rootEl?.addClass("contex-agent--has-chat");
    this.rootEl?.removeClass("contex-agent--home");
    this.refreshContextMeter();
    const shouldStickToBottom =
      this.shouldAutoScrollChat || this.isChatNearBottom();
    const messageEl = this.chatEl.createDiv({
      cls: "contex-agent__message contex-agent__message--user contex-agent__message--optimistic"
    });
    messageEl.setAttribute("data-message-id", message.id);

    const messageHeaderEl = messageEl.createDiv({
      cls: "contex-agent__message-header"
    });
    messageHeaderEl.createDiv({
      cls: "contex-agent__message-role",
      text: formatChatMessageRoleLabel(message.role)
    });

    const contentEl = messageEl.createDiv({
      cls: "contex-agent__message-content contex-agent__message-content--plain"
    });
    contentEl.setText(message.content || "...");

    if (message.attachments?.length) {
      renderMessageAttachments(messageEl, message.attachments, setIcon);
    }

    if (shouldStickToBottom) {
      this.chatEl.scrollTop = this.chatEl.scrollHeight;
      this.shouldAutoScrollChat = true;
    }
  }

  private queuePersistChatState(): void {
    if (this.chatPersistTimer !== null) {
      window.clearTimeout(this.chatPersistTimer);
    }

    this.chatPersistTimer = window.setTimeout(() => {
      this.chatPersistTimer = null;
      void this.persistChatState();
    }, 500);
  }

  private async persistChatState(): Promise<void> {
    await this.plugin.saveChatState({
      sessions: this.chatSessions,
      activeChatId: this.activeChatId
    });
  }

  private renderDiffPreview(
    parentEl: HTMLElement,
    message: ChatMessage
  ): void {
    const diffPreview = message.diffPreview;

    if (!diffPreview) {
      return;
    }

    const previewEl = parentEl.createDiv({
      cls: "contex-agent__diff-preview"
    });

    const isPending = diffPreview.status === "pending";

    if (isPending && this.activeRefineMessageId === message.id) {
      this.renderRefinePanel(previewEl, message.id);
    }

    previewEl.createDiv({
      cls: "contex-agent__diff-title",
      text: diffPreview.title
    });

    previewEl.createDiv({
      cls: [
        "contex-agent__diff-status",
        `contex-agent__diff-status--${diffPreview.status}`
      ],
      text: `Status: ${diffPreview.status}`
    });

    if (!isPending) {
      this.renderCompactDiffPreview(previewEl, message.id, diffPreview);
      return;
    }

    const panesEl = previewEl.createDiv({
      cls: "contex-agent__diff-panes"
    });
    this.renderDiffPane(panesEl, "Original", diffPreview.original);
    this.renderDiffPane(panesEl, "Suggested", diffPreview.suggested);

    const diffEl = previewEl.createDiv({
      cls: "contex-agent__diff-lines",
      attr: {
        "aria-label": "Diff preview"
      }
    });

    buildLineDiff(diffPreview.original, diffPreview.suggested).forEach(
      (line) => {
        const lineEl = diffEl.createDiv({
          cls: [
            "contex-agent__diff-line",
            `contex-agent__diff-line--${line.type}`
          ],
          text: `${getDiffPrefix(line.type)} ${line.text}`
        });
        lineEl.toggleClass("contex-agent__diff-line--empty", !line.text);
      }
    );

    this.renderDiffActions(previewEl, message.id, diffPreview);
  }

  private renderTypingIndicator(parentEl: HTMLElement): void {
    const indicatorEl = parentEl.createDiv({
      cls: "contex-agent__typing-indicator",
      attr: {
        "aria-label": "Assistant is thinking"
      }
    });
    indicatorEl.createSpan({
      text: "Assistant"
    });

    const cancelButton = indicatorEl.createEl("button", {
      cls: "contex-agent__typing-cancel",
      attr: {
        type: "button",
        "aria-label": "Cancel response"
      }
    });
    cancelButton.addEventListener("click", () => {
      this.cancelCurrentGeneration();
    });
    const dotsEl = cancelButton.createSpan({
      cls: "contex-agent__thinking-dots"
    });

    for (let index = 0; index < 3; index += 1) {
      dotsEl.createSpan({
        cls: "contex-agent__thinking-dot"
      });
    }
  }

  private renderActionReceipt(
    parentEl: HTMLElement,
    receipt: ActionReceipt
  ): void {
    const receiptEl = parentEl.createDiv({
      cls: [
        "contex-agent__action-receipt",
        `contex-agent__action-receipt--${receipt.status}`
      ]
    });
    receiptEl.createSpan({
      cls: "contex-agent__action-receipt-status",
      text: formatActionReceiptStatus(receipt.status)
    });
    receiptEl.createSpan({
      cls: "contex-agent__action-receipt-label",
      text: receipt.label
    });

    if (receipt.detail) {
      receiptEl.createSpan({
        cls: "contex-agent__action-receipt-detail",
        text: receipt.detail
      });
    }

    if (receipt.path) {
      const openButton = receiptEl.createEl("button", {
        text: "Open"
      });
      openButton.addEventListener("click", () => {
        void this.openVaultPath(receipt.path ?? "", `Opened: ${receipt.path}`);
      });
    }
  }

  private renderVaultSearchResults(
    parentEl: HTMLElement,
    message: ChatMessage
  ): void {
    const results = message.vaultSearchResults ?? [];
    const query = message.vaultSearchQuery ?? "";
    const rootEl = parentEl.createDiv({
      cls: "contex-agent__search-results"
    });

    rootEl.createDiv({
      cls: "contex-agent__search-title",
      text: results.length
        ? `Search results for "${query}"`
        : `No results for "${query}"`
    });

    if (!results.length) {
      return;
    }

    const actionsEl = rootEl.createDiv({
      cls: "contex-agent__search-actions"
    });
    const askAllButton = actionsEl.createEl("button", {
      cls: "mod-cta",
      text: "Attach all"
    });
    askAllButton.addEventListener("click", () => {
      this.attachVaultResults(results);
    });

    results.forEach((result, index) => {
      const resultEl = rootEl.createDiv({
        cls: "contex-agent__search-result"
      });
      resultEl.createDiv({
        cls: "contex-agent__search-result-title",
        text: `${index + 1}. ${result.path}`
      });
      resultEl.createDiv({
        cls: "contex-agent__search-result-score",
        text: [
          `Score: ${result.score}`,
          result.matches?.length ? `Matches: ${result.matches.join(", ")}` : ""
        ]
          .filter(Boolean)
          .join(" | ")
      });
      if (result.heading) {
        resultEl.createDiv({
          cls: "contex-agent__search-result-heading",
          text: `Heading: ${result.heading}`
        });
      }
      resultEl.createDiv({
        cls: "contex-agent__search-result-snippet",
        text: result.snippet
      });
      const resultActionsEl = resultEl.createDiv({
        cls: "contex-agent__search-result-actions"
      });
      const attachButton = resultActionsEl.createEl("button", {
        text: "Attach"
      });
      attachButton.addEventListener("click", () => {
        this.attachVaultResults([result]);
      });
      const openButton = resultActionsEl.createEl("button", {
        text: "Open"
      });
      openButton.addEventListener("click", () => {
        void this.openVaultPath(result.path, `Opened file: ${result.path}`);
      });
    });
  }

  private async renderWebResearchMessage(
    parentEl: HTMLElement,
    message: ChatMessage
  ): Promise<void> {
    const query = message.webResearchQuery ?? "";
    const searchQuery = message.webSearchQuery ?? query;
    const results = message.webResearchResults ?? [];
    const rootEl = parentEl.createDiv({
      cls: "contex-agent__web-research"
    });

    if (message.content.trim()) {
      const answerEl = rootEl.createDiv({
        cls: "contex-agent__web-research-answer markdown-rendered"
      });
      await MarkdownRenderer.render(
        this.app,
        stripHiddenTtsHints(message.content),
        answerEl,
        getCurrentNoteLabel(this.app) ?? "",
        this
      );
    }

    const actionsEl = rootEl.createDiv({
      cls: "contex-agent__web-research-actions"
    });
    actionsEl.createDiv({
      cls: "contex-agent__web-research-provider",
      text: [
        message.webResearchProvider
          ? `Provider: ${message.webResearchProvider}`
          : "",
        searchQuery && searchQuery !== query ? `Search: ${searchQuery}` : "",
        message.webResearchFallbackReason ? "Fallback used" : ""
      ]
        .filter(Boolean)
        .join(" | ")
    });
    const createNoteButton = actionsEl.createEl("button", {
      cls: "mod-cta",
      text: "Create research note"
    });
    createNoteButton.disabled = !results.length || this.isLoading;
    createNoteButton.addEventListener("click", () => {
      void this.createWebResearchNote(message);
    });

    const resultsEl = rootEl.createDiv({
      cls: "contex-agent__web-results"
    });
    resultsEl.createDiv({
      cls: "contex-agent__web-results-title",
      text: results.length
        ? `Web sources for "${query}"`
        : `No web sources for "${query}"`
    });

    results.forEach((result, index) => {
      const resultEl = resultsEl.createDiv({
        cls: "contex-agent__web-result"
      });
      const titleEl = resultEl.createEl("a", {
        cls: "contex-agent__web-result-title",
        text: `${index + 1}. ${result.title}`,
        href: result.url
      });
      titleEl.setAttribute("target", "_blank");
      titleEl.setAttribute("rel", "noopener noreferrer");
      resultEl.createDiv({
        cls: "contex-agent__web-result-url",
        text: result.url
      });
      if (
        result.source ||
        result.sourceType ||
        result.publishedDate ||
        result.freshnessHint
      ) {
        resultEl.createDiv({
          cls: "contex-agent__web-result-meta",
          text: [
            result.source,
            result.sourceType ? `Type: ${result.sourceType}` : "",
            result.publishedDate,
            result.freshnessHint ? `Date: ${result.freshnessHint}` : ""
          ]
            .filter(Boolean)
            .join(" | ")
        });
      }
      if (result.qualityNotes?.length) {
        resultEl.createDiv({
          cls: "contex-agent__web-result-quality",
          text: result.qualityNotes.join(" | ")
        });
      }
      resultEl.createDiv({
        cls: "contex-agent__web-result-snippet",
        text: result.snippet || "No snippet returned."
      });
    });
  }

  private async createWebResearchNote(message: ChatMessage): Promise<void> {
    const query = message.webResearchQuery ?? "Web research";
    const searchQuery = message.webSearchQuery ?? query;
    const results = message.webResearchResults ?? [];

    if (!results.length) {
      this.setError("There are no web sources to save yet.");
      return;
    }

    const content = [
      `# Research: ${query}`,
      "",
      `Checked: ${new Date().toISOString().slice(0, 10)}`,
      searchQuery !== query ? `Search query: ${searchQuery}` : "",
      "",
      "## Summary",
      "",
      message.content.trim(),
      "",
      "## Sources",
      "",
      ...results.map((result, index) =>
        [
          `${index + 1}. [${escapeMarkdownLinkText(result.title)}](${result.url})`,
          result.source ? `   - Source: ${result.source}` : "",
          result.sourceType ? `   - Type: ${result.sourceType}` : "",
          result.publishedDate ? `   - Published: ${result.publishedDate}` : "",
          result.freshnessHint ? `   - Date signal: ${result.freshnessHint}` : "",
          result.qualityNotes?.length
            ? `   - Quality: ${result.qualityNotes.join("; ")}`
            : "",
          result.snippet ? `   - Snippet: ${result.snippet}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      )
    ].join("\n");
    const sourceContext: SelectedTextContext = {
      path: "Web Research",
      name: query,
      text: formatWebSearchContext(results),
      isTruncated: false,
      originalLength: content.length,
      includedLength: content.length
    };

    new CreateNoteModal(this.app, {
      title: "Create Research Note",
      createButtonText: "Create",
      proposal: {
        path: await getUniqueNotePath(
          this.app,
          `${PROJECT_RESEARCH_FOLDER}/${slugifyTitle(query)}.md`
        ),
        content
      },
      onApply: async (proposal) => {
        await this.applyCreateNoteProposal(
          proposal,
          sourceContext,
          `Research web: ${query}`
        );
      }
    }).open();
  }

  private renderAnswerSources(
    parentEl: HTMLElement,
    sources: VaultSearchResult[],
    sections: VaultSourceSection[] = []
  ): void {
    const visibleSources = sources.slice(0, 2);

    if (!visibleSources.length) {
      return;
    }

    const sourcesEl = parentEl.createEl("details", {
      cls: "contex-agent__answer-sources"
    });
    const sourceLabel =
      this.getUiLanguage() === "ru" ? "Источники" : "Sources";
    sourcesEl.createEl("summary", {
      cls: "contex-agent__answer-sources-title",
      text:
        sources.length > visibleSources.length
          ? `${sourceLabel} · ${visibleSources.length}/${sources.length}`
          : `${sourceLabel} · ${visibleSources.length}`
    });

    visibleSources.forEach((source) => {
      const sourceEl = sourcesEl.createDiv({
        cls: "contex-agent__answer-source"
      });
      const headerEl = sourceEl.createDiv({
        cls: "contex-agent__answer-source-header"
      });
      headerEl.createDiv({
        cls: "contex-agent__answer-source-path",
        text: source.path
      });
      const openButton = headerEl.createEl("button", {
        text: "Open"
      });
      openButton.addEventListener("click", () => {
        void this.openVaultPath(source.path, `Opened source: ${source.path}`);
      });
    });
  }

  private renderInlineWebSources(
    parentEl: HTMLElement,
    sources: WebSearchResult[]
  ): void {
    const visibleSources = sources.slice(0, 2);

    if (!visibleSources.length) {
      return;
    }

    const sourcesEl = parentEl.createEl("details", {
      cls: "contex-agent__inline-web-sources"
    });
    const sourceLabel =
      this.getUiLanguage() === "ru" ? "Web-источники" : "Web sources";
    sourcesEl.createEl("summary", {
      cls: "contex-agent__inline-web-sources-title",
      text:
        sources.length > visibleSources.length
          ? `${sourceLabel} · ${visibleSources.length}/${sources.length}`
          : `${sourceLabel} · ${visibleSources.length}`
    });

    visibleSources.forEach((source, index) => {
      const sourceEl = sourcesEl.createDiv({
        cls: "contex-agent__inline-web-source"
      });
      const titleEl = sourceEl.createEl("a", {
        cls: "contex-agent__inline-web-source-title",
        text: `${index + 1}. ${source.title}`,
        href: source.url
      });
      titleEl.setAttribute("target", "_blank");
      titleEl.setAttribute("rel", "noopener noreferrer");
      sourceEl.createDiv({
        cls: "contex-agent__inline-web-source-meta",
        text: [
          source.source,
          source.sourceType ? `Type: ${source.sourceType}` : "",
          source.publishedDate,
          source.freshnessHint ? `Date: ${source.freshnessHint}` : ""
        ]
          .filter(Boolean)
          .join(" | ")
      });
    });
  }

  private attachVaultResults(results: VaultSearchResult[]): void {
    this.attachedVaultResults = results;
    this.useVaultSearch = true;
    this.rememberVaultSearch(this.voiceSessionMemory.currentTopic ?? "", results);

    if (this.useVaultSearchEl) {
      this.useVaultSearchEl.checked = true;
    }

    this.setContextDetail(
      `Attached ${results.length} vault search result${results.length === 1 ? "" : "s"} to the next message.`,
      false
    );
    this.renderAttachedContext();

    if (this.inputEl) {
      this.inputEl.focus();
    }
  }

  private async handlePaste(event: ClipboardEvent): Promise<void> {
    const clipboardData = event.clipboardData;

    if (!clipboardData) {
      return;
    }

    const files = Array.from(clipboardData.files);

    for (const item of Array.from(clipboardData.items ?? [])) {
      if (item.kind !== "file") {
        continue;
      }

      const file = item.getAsFile();

      if (!file) {
        continue;
      }

      const hasSameFile = files.some(
        (candidate) =>
          candidate.name === file.name &&
          candidate.size === file.size &&
          candidate.type === file.type
      );

      if (!hasSameFile) {
        files.push(file.name ? file : renameClipboardFile(file));
      }
    }

    if (!files.length) {
      return;
    }

    event.preventDefault();
    await this.attachFiles(files);
  }

  private async attachFiles(files: File[]): Promise<void> {
    if (!files.length) {
      return;
    }

    this.setError(null);
    this.statusEl?.setText("Status: Attaching files");

    try {
      const attachments = await Promise.all(
        files.map((file) => this.attachmentController.readAttachment(file))
      );
      this.attachedFiles = [...this.attachedFiles, ...attachments].slice(0, 8);
      this.renderAttachedContext();
      this.setContextDetail(
        `Attached ${attachments.length} file${attachments.length === 1 ? "" : "s"} to the next message.`,
        false
      );
      this.statusEl?.setText("Status: Ready");
      this.inputEl?.focus();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Attach failed");
    }
  }

  private rememberVaultSearch(query: string, results: VaultSearchResult[]): void {
    if (!results.length) {
      this.voiceSessionMemory = {
        ...this.voiceSessionMemory,
        currentTopic: query || this.voiceSessionMemory.currentTopic,
        lastUserIntent: query ? `search:${query}` : this.voiceSessionMemory.lastUserIntent,
        updatedAt: Date.now()
      };
      return;
    }

    const primaryPath = results[0].path;
    this.voiceSessionMemory = {
      activeFolder: getFolderPath(primaryPath),
      currentTopic: query || this.voiceSessionMemory.currentTopic,
      lastFoundFiles: results,
      lastOpenedFile: primaryPath,
      lastUserIntent: query ? `search:${query}` : "search",
      updatedAt: Date.now()
    };
    this.setContextDetail(`Voice memory: ${primaryPath}`, false);
  }

  private appendLocalChatExchange(
    userContent: string,
    assistantContent: string
  ): void {
    this.messages.push(
      {
        id: `${Date.now()}-${this.messages.length}`,
        role: "user",
        content: userContent,
        createdAt: Date.now()
      },
      {
        id: `${Date.now()}-${this.messages.length + 1}`,
        role: "assistant",
        content: assistantContent,
        createdAt: Date.now()
      }
    );
    void this.renderMessages();
  }

  private async buildContexCodePlanDraftForActiveNote(): Promise<unknown | null> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile || !activeFile.path.toLowerCase().endsWith(".md")) {
      return null;
    }

    try {
      const markdown = await this.app.vault.read(activeFile);
      const response = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-contex-code-plan-draft`,
          role: "user",
          content: buildContexCodePlanDraftPrompt({
            path: activeFile.path,
            markdown
          }),
          createdAt: Date.now()
        }
      ]);

      return JSON.parse(cleanJsonLikeResponse(response));
    } catch (error) {
      console.warn("[Mindo] Falling back to heuristic Mindo Code plan", error);
      return null;
    }
  }

  private createContexCodeController(): ContexCodeCommandController {
    return new ContexCodeCommandController(
      this.app as unknown as ContexCodeAppLike,
      this.plugin.settings
    );
  }

  private async createContexCodePlan(): Promise<void> {
    this.setError(null);
    this.setLoading(true);

    try {
      this.statusEl?.setText("Status: Planning code tasks");
      const planDraft = await this.buildContexCodePlanDraftForActiveNote();
      const result = await this.createContexCodeController().createPlan(planDraft);
      this.appendActionReceipt({
        status: "saved",
        label: "Created Code Plan",
        detail: result.path ?? result.planId,
        path: result.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    } finally {
      this.statusEl?.setText("Status: Ready");
      this.setLoading(false);
    }
  }

  private async prepareContexCodeTaskPacket(): Promise<void> {
    this.setError(null);
    this.setLoading(true);

    try {
      const result = await this.createContexCodeController().prepareTaskPacket();
      await navigator.clipboard.writeText(result.packet);
      this.appendActionReceipt({
        status: "done",
        label: "Prepared Code Task Packet",
        detail: "Copied to clipboard.",
        path: result.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    } finally {
      this.setLoading(false);
    }
  }

  private async markContexCodeTaskDone(): Promise<void> {
    this.setError(null);
    this.setLoading(true);

    try {
      const result = await this.createContexCodeController().markTaskDone();
      this.appendActionReceipt({
        status: "saved",
        label: "Marked Code Task Done",
        detail: result.path ?? result.planId,
        path: result.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    } finally {
      this.setLoading(false);
    }
  }

  private async syncContexCodePlan(): Promise<void> {
    this.setError(null);
    this.setLoading(true);

    try {
      const result = await this.createContexCodeController().syncPlan();
      this.appendActionReceipt({
        status: "saved",
        label: "Synced Code Plan",
        detail: result.path ?? result.planId,
        path: result.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
    } finally {
      this.setLoading(false);
    }
  }

  private appendActionReceipt(
    receipt: ActionReceipt,
    userContent?: string,
    userAttachments?: LlmFileAttachment[] | null
  ): void {
    const messages = this.chatController.createActionReceiptMessages(
      receipt,
      this.messages.length,
      this.suppressActionReceiptUserContent ? undefined : userContent,
      userAttachments?.length ? userAttachments : null
    );

    this.messages.push(...messages);
    void this.renderMessages();
    void this.recordWikiAutopilotMemory({
      userText: userContent ?? "",
      assistantText: [receipt.label, receipt.detail].filter(Boolean).join("\n"),
      receipts: [this.toWikiActionReceipt(receipt)],
      sourcePaths: receipt.path ? [receipt.path] : []
    });
  }

  private appendWorkflowReceipt(
    receipt: ActionReceipt,
    userContent?: string
  ): void {
    console.debug("[Mindo] Workflow receipt", receipt);
    this.appendActionReceipt(receipt, userContent);
  }

  private toWikiActionReceipt(receipt: ActionReceipt): ContexActionReceipt {
    return {
      actionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: this.getWikiReceiptKind(receipt),
      status: receipt.status,
      label: receipt.label,
      detail: receipt.detail,
      path: receipt.path
    };
  }

  private getWikiReceiptKind(receipt: ActionReceipt): ContexActionKind {
    const text = `${receipt.label} ${receipt.detail ?? ""}`.toLowerCase();

    if (text.includes("research")) {
      return "research_note";
    }

    if (text.includes("created note") || text.includes("drafting note")) {
      return "create_note";
    }

    if (text.includes("applied") || text.includes("change")) {
      return "replace_text";
    }

    if (text.includes("opened")) {
      return "open_note";
    }

    return "none";
  }

  private async recordWikiAutopilotMemory(input: {
    userText: string;
    assistantText?: string;
    receipts?: ContexActionReceipt[];
    sourcePaths?: string[];
    webSources?: WebSearchResult[];
  }): Promise<void> {
    if (
      !this.plugin.settings.wikiEnabled ||
      this.plugin.settings.wikiMemoryMode === "manual"
    ) {
      return;
    }

    const userText = input.userText.trim();
    const assistantText = input.assistantText?.trim() ?? "";

    if (!userText && !assistantText && !input.sourcePaths?.length) {
      return;
    }

    try {
      await ensureContexWikiStructure(this.app, this.plugin.settings);
      const now = new Date().toISOString();
      const decision = decideWikiAutopilot({
        userText,
        assistantText,
        receipts: input.receipts,
        sourcePaths: input.sourcePaths,
        webSources: input.webSources?.map((source) => ({
          title: source.title,
          url: source.url,
          date: source.publishedDate,
          excerpt: source.snippet
        })),
        now
      });

      if (!decision.shouldWriteWiki) {
        return;
      }

      const record = createRawIngestionRecord({
        kind: "chat",
        title: decision.title,
        locator: `chat:${this.activeChatId ?? "current"}`,
        capturedAt: now,
        metadata: {
          reason: decision.reason,
          confidence: Math.round(decision.confidence * 100) / 100,
          mode: this.plugin.settings.wikiMemoryMode
        },
        content: [
          "# Automatic Wiki Memory",
          "",
          userText ? "## User" : "",
          userText,
          assistantText ? "## Assistant" : "",
          assistantText,
          decision.sourcePaths.length ? "## Source Paths" : "",
          ...decision.sourcePaths.map((path) => `- [[${path}]]`),
          decision.sources.length ? "## Sources" : "",
          ...decision.sources.map((source) => `- ${source.title}: ${source.locator}`)
        ]
          .filter((line) => line !== "")
          .join("\n")
      });
      const rawPath = getRawIngestionPath(
        this.plugin.settings.wikiRootFolder,
        record
      );

      if (!(await this.app.vault.adapter.exists(rawPath))) {
        await this.app.vault.adapter.write(
          rawPath,
          buildRawIngestionMarkdown(record)
        );
      }

      await this.writeWikiAutopilotNode({
        title: decision.title,
        summary: assistantText || userText || decision.reason,
        rawPath,
        capturedAt: now,
        confidence: decision.confidence,
        sourcePaths: decision.sourcePaths
      });
    } catch (error) {
      console.warn("[Mindo Wiki] Autopilot memory write failed", error);
    }
  }

  private async writeWikiAutopilotNode(input: {
    title: string;
    summary: string;
    rawPath: string;
    capturedAt: string;
    confidence: number;
    sourcePaths: string[];
  }): Promise<void> {
    const title = slugifyTitle(input.title || "Mindo Wiki Update").slice(0, 90);
    const rawSource = {
      id: `raw-${Date.now().toString(36)}`,
      kind: "raw" as const,
      title: "Automatic chat memory",
      locator: input.rawPath,
      capturedAt: input.capturedAt,
      excerpt: trimTextForContext(input.summary, 240)
    };
    const vaultSources = input.sourcePaths.slice(0, 6).map((path, index) => ({
      id: `vault-${index}-${Date.now().toString(36)}`,
      kind: "vault" as const,
      title: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
      locator: path,
      capturedAt: input.capturedAt
    }));
    const node: ContexWikiNode = {
      id: createWikiNodeId("concept", title),
      type: "concept",
      title,
      aliases: [],
      summary: trimTextForContext(input.summary, 1200),
      path: "",
      confidence: input.confidence,
      freshness: "current",
      sources: [rawSource, ...vaultSources],
      relations: [],
      createdAt: input.capturedAt,
      updatedAt: input.capturedAt
    };
    const nodePath = getWikiNodeMarkdownPath(
      this.plugin.settings.wikiRootFolder,
      node
    );
    node.path = nodePath;

    if (!(await this.app.vault.adapter.exists(nodePath))) {
      await this.app.vault.adapter.write(
        nodePath,
        buildWikiNodeMarkdown(this.plugin.settings.wikiRootFolder, node)
      );
    } else {
      const existing = await this.app.vault.adapter.read(nodePath);
      const updateBlock = [
        "",
        "## Latest Automatic Update",
        "",
        `Captured: ${input.capturedAt}`,
        "",
        trimTextForContext(input.summary, 1200),
        "",
        `Raw source: [[${input.rawPath}]]`,
        ""
      ].join("\n");

      if (!existing.includes(`Raw source: [[${input.rawPath}]]`)) {
        await this.app.vault.adapter.write(nodePath, `${existing.trim()}\n${updateBlock}`);
      }
    }

    const paths = getContexWikiPaths(this.plugin.settings.wikiRootFolder);
    const existingNodes = await this.app.vault.adapter.exists(paths.schema.nodes)
      ? await this.app.vault.adapter.read(paths.schema.nodes)
      : "";
    const serializedNode = serializeWikiJsonl([node]);

    if (!existingNodes.includes(`"id":"${node.id}"`)) {
      await this.app.vault.adapter.write(
        paths.schema.nodes,
        `${existingNodes}${serializedNode}`
      );
    }
  }

  private findLastMentionedMarkdownPaths(): string[] {
    const files = this.app.vault.getMarkdownFiles();
    const paths: string[] = [];

    for (const message of [...this.messages].reverse()) {
      if (message.role === "assistant") {
        paths.push(...findMarkdownPathsInText(message.content, files));
      }

      if (message.sources?.length) {
        paths.push(...message.sources.map((source) => source.path));
      }

      if (paths.length) {
        return Array.from(new Set(paths));
      }
    }

    return [];
  }

  private renderAttachedContext(): void {
    this.refreshContextMeter();

    if (!this.attachedContextEl) {
      return;
    }

    this.attachedContextEl.empty();

    const results = this.attachedVaultResults ?? [];
    const files = this.attachedFiles;

    if (!results.length && !files.length) {
      this.attachedContextEl.style.display = "none";
      return;
    }

    this.attachedContextEl.style.display = "flex";
    const summaryEl = this.attachedContextEl.createDiv({
      cls: "contex-agent__attached-context-summary"
    });
    summaryEl.createDiv({
      cls: "contex-agent__attached-context-title",
      text: [
        results.length
          ? `${results.length} search result${results.length === 1 ? "" : "s"}`
          : "",
        files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : ""
      ]
        .filter(Boolean)
        .join(" + ")
    });
    summaryEl.createDiv({
      cls: "contex-agent__attached-context-paths",
      text: [
        ...results.slice(0, 5).map((result) => result.path),
        ...files
          .slice(0, 5)
          .map(
            (file) =>
              `${file.name} (${file.type || "unknown"}, ${formatBytes(file.size)})`
          )
      ]
        .join("\n")
    });

    const previewableImages = files.filter(
      (file) => file.dataUrl && file.type.startsWith("image/")
    );

    if (previewableImages.length) {
      const previewsEl = summaryEl.createDiv({
        cls: "contex-agent__attached-context-previews"
      });

      previewableImages.slice(0, 4).forEach((file) => {
        previewsEl.createEl("img", {
          cls: "contex-agent__attached-context-thumb",
          attr: {
            src: file.dataUrl ?? "",
            alt: file.name
          }
        });
      });
    }

    const clearButton = this.attachedContextEl.createEl("button", {
      cls: "contex-agent__attached-context-clear",
      attr: {
        type: "button",
        "aria-label": "Clear attached context"
      }
    });
    setIcon(clearButton, "x");
    clearButton.addEventListener("click", () => {
      this.attachedVaultResults = null;
      this.attachedFiles = [];
      this.renderAttachedContext();
      this.setContextDetail("Attached context cleared.", false);
    });
  }

  private renderCompactDiffPreview(
    parentEl: HTMLElement,
    messageId: string,
    diffPreview: TextDiffPreview
  ): void {
    const compactEl = parentEl.createDiv({
      cls: "contex-agent__diff-compact"
    });
    compactEl.createDiv({
      cls: "contex-agent__diff-compact-text",
      text: getCompactDiffStatusText(diffPreview.status)
    });

    const buttons = getInlineDiffActionButtons(diffPreview.status);

    if (buttons.length === 0) {
      return;
    }

    const actionsEl = compactEl.createDiv({
      cls: "contex-agent__diff-actions"
    });

    buttons.forEach((button) => {
      const buttonEl = actionsEl.createEl("button", {
        cls: button.primary ? "mod-cta" : undefined,
        text: button.label
      });
      buttonEl.disabled = this.isLoading;
      buttonEl.addEventListener("click", () => {
        if (button.action === "undo") {
          void this.undoDiffPreview(messageId);
        }
      });
    });
  }

  private renderRefinePanel(parentEl: HTMLElement, messageId: string): void {
    const panelEl = parentEl.createDiv({
      cls: "contex-agent__diff-refine"
    });
    const inputEl = panelEl.createEl("textarea", {
      cls: "contex-agent__diff-refine-input",
      attr: {
        placeholder: "What should change? e.g. Add one more concrete example."
      }
    });
    const actionsEl = panelEl.createDiv({
      cls: "contex-agent__diff-refine-actions"
    });
    const updateButton = actionsEl.createEl("button", {
      cls: "mod-cta",
      text: "Update"
    });
    const cancelButton = actionsEl.createEl("button", {
      text: "Cancel"
    });

    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void this.refineDiffPreview(messageId, inputEl.value);
      }
    });
    updateButton.addEventListener("click", () => {
      void this.refineDiffPreview(messageId, inputEl.value);
    });
    cancelButton.addEventListener("click", () => {
      this.activeRefineMessageId = null;
      void this.renderMessages();
    });

    window.setTimeout(() => inputEl.focus(), 0);
  }

  private renderDiffActions(
    parentEl: HTMLElement,
    messageId: string,
    diffPreview: TextDiffPreview
  ): void {
    const actionsEl = parentEl.createDiv({
      cls: "contex-agent__diff-actions"
    });
    const isPending = diffPreview.status === "pending";

    getInlineDiffActionButtons(diffPreview.status).forEach((button) => {
      const buttonEl = actionsEl.createEl("button", {
        cls: button.primary ? "mod-cta" : undefined,
        text: button.label
      });
      buttonEl.disabled = !isPending || this.isLoading;
      buttonEl.addEventListener("click", () => {
        if (button.action === "accept") {
          void this.applyDiffPreview(messageId);
          return;
        }

        if (button.action === "change") {
          this.activeRefineMessageId =
            this.activeRefineMessageId === messageId ? null : messageId;
          void this.renderMessages();
          return;
        }

        if (button.action === "reject") {
          this.rejectDiffPreview(messageId);
          return;
        }

        void this.undoDiffPreview(messageId);
      });
    });

    const showButton = actionsEl.createEl("button", {
      text: "Show in note"
    });

    showButton.disabled = !isPending || this.isLoading;
    showButton.addEventListener("click", () => {
      void this.showInlineDiffForMessage(messageId);
    });
  }

  private renderDiffPane(
    parentEl: HTMLElement,
    title: string,
    content: string
  ): void {
    const paneEl = parentEl.createDiv({ cls: "contex-agent__diff-pane" });
    paneEl.createDiv({ cls: "contex-agent__diff-pane-title", text: title });
    paneEl.createEl("pre", {
      cls: "contex-agent__diff-pane-content",
      text: content
    });
  }

  private async applyDiffPreview(messageId: string): Promise<void> {
    const message = this.findMessage(messageId);
    const diffPreview = message?.diffPreview;

    if (!diffPreview || diffPreview.status !== "pending") {
      return;
    }

    const file = this.getDiffPreviewFile(diffPreview);

    if (!file) {
      this.setError(`Could not find source note: ${diffPreview.sourcePath}`);
      this.statusEl?.setText("Status: Apply failed");
      return;
    }

    try {
      assertWritableVaultPath(file.path, this.app.vault.configDir);
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Apply blocked");
      return;
    }

    this.setError(null);
    this.setLoading(true);

    try {
      const currentContent = await this.app.vault.read(file);
      const nextContent = replaceSelectedOccurrence(
        currentContent,
        diffPreview.original,
        diffPreview.suggested,
        diffPreview.originalOccurrenceIndex
      );
      const operation = await recordAiChangeOperation(this.app, {
        operationType: diffPreview.operationType ?? "improve-selection",
        filePath: file.path,
        beforeContent: currentContent,
        afterContent: nextContent,
        selectedBefore: diffPreview.original,
        selectedAfter: diffPreview.suggested,
        model: this.plugin.settings.model,
        userPrompt: diffPreview.userPrompt ?? "Improve selection"
      });

      await this.app.vault.modify(file, nextContent);
      await markAiChangeOperationApplied(this.app, operation.id);
      diffPreview.historyOperationId = operation.id;
      diffPreview.status = "applied";
      this.activeRefineMessageId = null;
      clearInlineDiffPreview(this.app, file.path);
      this.statusEl?.setText("Status: Applied");
      new Notice("Mindo applied the suggested replacement.");
      this.appendActionReceipt({
        status: "done",
        label: "Applied change",
        detail: file.path,
        path: file.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Apply failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async undoDiffPreview(messageId: string): Promise<void> {
    const message = this.findMessage(messageId);
    const diffPreview = message?.diffPreview;

    if (!diffPreview || diffPreview.status !== "applied") {
      return;
    }

    const file = this.getDiffPreviewFile(diffPreview);

    if (!file) {
      this.setError(`Could not find source note: ${diffPreview.sourcePath}`);
      this.statusEl?.setText("Status: Undo failed");
      return;
    }

    this.setError(null);
    this.setLoading(true);

    try {
      if (diffPreview.historyOperationId) {
        await rollbackAiChangeOperation(
          this.app,
          diffPreview.historyOperationId
        );
        diffPreview.status = "reverted";
        this.activeRefineMessageId = null;
        this.statusEl?.setText("Status: Reverted");
        new Notice("Mindo reverted the accepted replacement.");
        this.appendActionReceipt({
          status: "reverted",
          label: "Reverted change",
          detail: file.path,
          path: file.path
        });
        return;
      }

      const currentContent = await this.app.vault.read(file);
      const occurrenceCount = countOccurrences(
        currentContent,
        diffPreview.suggested
      );

      if (occurrenceCount === 0) {
        throw new Error(
          "Suggested text was not found in the source note. The note may have changed."
        );
      }

      if (occurrenceCount > 1) {
        throw new Error(
          "Suggested text appears more than once. Undo would be ambiguous."
        );
      }

      await this.app.vault.modify(
        file,
        currentContent.replace(diffPreview.suggested, diffPreview.original)
      );
      diffPreview.status = "reverted";
      this.activeRefineMessageId = null;
      this.statusEl?.setText("Status: Reverted");
      new Notice("Mindo reverted the accepted replacement.");
      this.appendActionReceipt({
        status: "reverted",
        label: "Reverted change",
        detail: file.path,
        path: file.path
      });
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Undo failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private async refineDiffPreview(
    messageId: string,
    instruction: string
  ): Promise<void> {
    const trimmedInstruction = instruction.trim();
    const message = this.findMessage(messageId);
    const diffPreview = message?.diffPreview;

    if (!trimmedInstruction || !diffPreview || diffPreview.status !== "pending") {
      return;
    }

    this.setError(null);
    this.setLoading(true);
    this.statusEl?.setText("Status: Updating preview");

    try {
      const refined = await requestLlmChatCompletion(this.plugin.settings, [
        {
          id: `${Date.now()}-refine`,
          role: "user",
          content: [
            "Revise the suggested Markdown replacement based on the user's instruction.",
            "Preserve the meaning and language of the original selected text.",
            "Return only the final replacement Markdown. Do not add explanations, headings, quotes, or code fences.",
            "",
            "Original selected text:",
            diffPreview.original,
            "",
            "Current suggested replacement:",
            diffPreview.suggested,
            "",
            "User instruction:",
            trimmedInstruction
          ].join("\n"),
          createdAt: Date.now()
        }
      ]);

      diffPreview.suggested = cleanSuggestedReplacement(refined);
      this.activeRefineMessageId = null;
      this.statusEl?.setText("Status: Ready");
      void this.showInlineDiffForMessage(messageId);
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Update failed");
    } finally {
      this.setLoading(false);
      void this.renderMessages();
    }
  }

  private rejectDiffPreview(messageId: string): void {
    const message = this.findMessage(messageId);

    if (!message?.diffPreview || message.diffPreview.status !== "pending") {
      return;
    }

    message.diffPreview.status = "rejected";
    this.activeRefineMessageId = null;
    clearInlineDiffPreview(this.app, message.diffPreview.sourcePath);
    this.statusEl?.setText("Status: Rejected");
    this.appendActionReceipt({
      status: "rejected",
      label: "Rejected change preview",
      detail: message.diffPreview.sourcePath,
      path: message.diffPreview.sourcePath
    });
    void this.renderMessages();
  }

  private findMessage(messageId: string): ChatMessage | null {
    return this.messages.find((message) => message.id === messageId) ?? null;
  }

  private findLatestDiffMessage(
    status: TextDiffPreview["status"]
  ): ChatMessage | null {
    return (
      [...this.messages]
        .reverse()
        .find((message) => message.diffPreview?.status === status) ?? null
    );
  }

  private handleInlineDiffAction(event: Event): void {
    const detail = (event as CustomEvent<{
      messageId?: string;
      action?: InlineDiffAction;
    }>).detail;

    if (!detail?.messageId || !detail.action) {
      return;
    }

    if (detail.action === "accept") {
      void this.applyDiffPreview(detail.messageId);
      return;
    }

    if (detail.action === "change") {
      this.activeRefineMessageId =
        this.activeRefineMessageId === detail.messageId
          ? null
          : detail.messageId;
      void this.renderMessages();
      return;
    }

    if (detail.action === "undo") {
      void this.undoDiffPreview(detail.messageId);
      return;
    }

    this.rejectDiffPreview(detail.messageId);
  }

  private async showInlineDiffForMessage(messageId: string): Promise<void> {
    const message = this.findMessage(messageId);
    const diffPreview = message?.diffPreview;

    if (!diffPreview || diffPreview.status !== "pending") {
      return;
    }

    const didShow = await showInlineDiffPreview(
      this.app,
      messageId,
      diffPreview
    );

    if (!didShow) {
      this.setContextDetail(
        "Inline diff could not be shown in the editor. The sidebar preview is still available.",
        true
      );
    }
  }

  private getDiffPreviewFile(diffPreview: TextDiffPreview): TFile | null {
    const abstractFile = this.app.vault.getAbstractFileByPath(
      diffPreview.sourcePath
    );

    return abstractFile instanceof TFile ? abstractFile : null;
  }

  private queueRenderMessages(): void {
    if (this.renderTimer !== null) {
      return;
    }

    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.renderMessages();
    }, 150);
  }

  private createSelectionToolbar(): void {
    this.selectionToolbarEl?.remove();
    this.selectionToolbarButtons = [];

    this.selectionToolbarEl = document.body.createDiv({
      cls: "contex-agent__selection-toolbar"
    });
    this.selectionToolbarEl.style.display = "none";

    SELECTED_TEXT_ACTIONS.forEach((action) => {
      const button = this.selectionToolbarEl?.createEl("button", {
        cls: "contex-agent__selection-toolbar-button",
        attr: {
          type: "button",
          "aria-label": action.label
        }
      });

      if (!button) {
        return;
      }

      if (action.icon) {
        setIcon(button, action.icon);
      } else {
        button.setText(action.label);
      }

      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (
          action.kind === "improve-selection" ||
          action.kind === "expand-selection"
        ) {
          void this.sendSelectedTextDiffAction(
            action,
            this.floatingSelectedTextContext,
            action.kind === "expand-selection"
              ? "Expand selection preview"
              : "Improve selection preview",
            action.kind
          );
          return;
        }

        if (action.kind === "create-note") {
          void this.createNoteFromSelection(this.floatingSelectedTextContext);
          return;
        }

        void this.sendSelectedTextAction(
          action.prompt,
          this.floatingSelectedTextContext
        );
      });
      this.selectionToolbarButtons.push(button);
    });
  }

  private queueSelectionToolbarUpdate(): void {
    if (this.selectionToolbarTimer !== null) {
      window.clearTimeout(this.selectionToolbarTimer);
    }

    this.selectionToolbarTimer = window.setTimeout(() => {
      this.selectionToolbarTimer = null;
      this.updateSelectionToolbar();
    }, 80);
  }

  private updateSelectionToolbar(): void {
    if (!this.selectionToolbarEl || this.isLoading) {
      return;
    }

    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range ? this.getSelectionRect(range) : null;
    const contextResult = getSelectedTextContext(this.app);

    if (!rect || !contextResult.context) {
      this.hideSelectionToolbar();
      return;
    }

    this.floatingSelectedTextContext = contextResult.context;
    this.lastSelectedTextContext = contextResult.context;
    this.lastSelectedTextContextAt = Date.now();
    this.selectionToolbarEl.toggleClass(
      "contex-agent__selection-toolbar--below",
      rect.top < 44
    );
    this.selectionToolbarEl.style.left = `${Math.min(
      window.innerWidth - 16,
      Math.max(16, rect.left + rect.width / 2)
    )}px`;
    this.selectionToolbarEl.style.top =
      rect.top < 44 ? `${rect.bottom + 8}px` : `${rect.top - 8}px`;
    this.selectionToolbarEl.style.display = "flex";
  }

  private getSelectionRect(range: Range): DOMRect | null {
    const rect = range.getBoundingClientRect();

    if (rect.width || rect.height) {
      return rect;
    }

    const firstRect = Array.from(range.getClientRects()).find(
      (clientRect) => clientRect.width || clientRect.height
    );
    return firstRect ?? null;
  }

  private hideSelectionToolbar(): void {
    if (this.selectionToolbarEl) {
      this.selectionToolbarEl.style.display = "none";
    }

    this.floatingSelectedTextContext = null;
  }

  private async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      this.stopRecording("insert");
      return;
    }

    if (this.isLiveDialogueSessionActive && this.speakingMessageId) {
      this.stopSpeaking();
    }

    await this.startRecording();
  }

  private async toggleLiveDialogueTurn(): Promise<void> {
    if (this.isLiveDialogueSessionActive && this.isRecording) {
      this.stopRecording("send");
      return;
    }

    if (
      this.liveDialogueController.shouldInterruptSpeech(
        this.isLiveDialogueSessionActive,
        Boolean(this.speakingMessageId)
      )
    ) {
      this.stopSpeaking();
      await this.startLiveDialogueListening();
      return;
    }

    if (this.isLiveDialogueSessionActive && this.isLoading) {
      this.cancelCurrentGeneration();
      await this.startLiveDialogueListening();
      return;
    }

    if (this.isLiveDialogueSessionActive) {
      this.stopLiveDialogueSession();
      return;
    }

    await this.startLiveDialogueSession();
  }

  private async startLiveDialogueSession(): Promise<void> {
    if (this.isLiveDialogueSessionActive) {
      return;
    }

    this.isLiveDialogueSessionActive = true;
    this.isLiveDialogueTurn = false;
    this.setError(null);
    this.statusEl?.setText("Status: Live Dialogue starting");
    this.updateLiveDialogueButton();

    const inputStream = await this.ensureLiveDialogueInputStream();
    if (!inputStream) {
      this.isLiveDialogueSessionActive = false;
      this.statusEl?.setText("Status: Voice unavailable");
      this.updateLiveDialogueButton();
      return;
    }

    void this.warmLiveDialogueAcknowledgements();
    void warmStreamingSpeechAudioContext().catch((error) => {
      console.debug("[Mindo] Live dialogue audio warmup unavailable", error);
    });
    this.syncLiveBargeInMonitor();

    const greetingMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}-live-greeting`,
      role: "assistant",
      content: createLiveDialogueGreeting(),
      createdAt: Date.now()
    };

    this.messages.push(greetingMessage);
    void this.renderMessages();
    await this.continueLiveDialogueWithMessage(greetingMessage);
  }

  private stopLiveDialogueSession(): void {
    this.isLiveDialogueSessionActive = false;
    this.isLiveDialogueTurn = false;
    this.stopLiveBargeInMonitor();
    this.stopLiveBargeInAudioMonitor();
    this.stopLiveDialogueAcknowledgement();

    if (this.isRecording) {
      this.stopRecording("discard");
    }

    if (this.isLoading) {
      this.cancelCurrentGeneration();
    }

    if (this.speakingMessageId) {
      this.stopSpeaking();
    }

    this.stopLiveDialogueInputStream();
    this.statusEl?.setText("Status: Live Dialogue stopped");
    this.updateLiveDialogueButton();
  }

  private async continueLiveDialogueWithMessage(
    message: ChatMessage
  ): Promise<void> {
    if (!this.isLiveDialogueSessionActive) {
      return;
    }

    await this.speakMessageAndWait(message);
    await this.startLiveDialogueListening();
  }

  private async continueLiveDialogueAfterLocalAction(): Promise<void> {
    if (!this.isLiveDialogueSessionActive) {
      return;
    }

    const latestAssistant = [...this.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const speech = latestAssistant?.actionReceipt
      ? buildLiveDialogueActionSpeech(latestAssistant.actionReceipt)
      : latestAssistant?.content.trim()
        ? trimTextForContext(latestAssistant.content, 360)
        : "Готово. Что дальше?";
    const speechMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}-live-action`,
      role: "assistant",
      content: speech,
      createdAt: Date.now()
    };

    this.messages.push(speechMessage);
    void this.renderMessages();
    await this.continueLiveDialogueWithMessage(speechMessage);
  }

  private async startLiveDialogueListening(): Promise<void> {
    if (
      !this.isLiveDialogueSessionActive ||
      this.isRecording ||
      this.isLoading ||
      this.isTranscribingVoice ||
      this.speakingMessageId
    ) {
      return;
    }

    this.isLiveDialogueTurn = true;
    this.stopLiveBargeInMonitor();
    this.updateLiveDialogueButton();
    this.statusEl?.setText("Status: Live Dialogue listening");
    await this.startRecording();
  }

  private getMicrophoneStreamConstraints(): MediaStreamConstraints {
    return {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
  }

  private hasLiveAudioTrack(stream: MediaStream | null): boolean {
    return Boolean(
      stream?.getAudioTracks().some((track) => track.readyState === "live")
    );
  }

  private async ensureLiveDialogueInputStream(): Promise<MediaStream | null> {
    if (!this.isLiveDialogueSessionActive) {
      return null;
    }

    if (this.hasLiveAudioTrack(this.liveDialogueInputStream)) {
      return this.liveDialogueInputStream;
    }

    this.stopLiveDialogueInputStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.setError("Voice recording is not available in this Obsidian window.");
      return null;
    }

    if (!this.liveDialogueInputStreamPromise) {
      this.liveDialogueInputStreamPromise = navigator.mediaDevices
        .getUserMedia(this.getMicrophoneStreamConstraints())
        .then((stream) => {
          if (!this.isLiveDialogueSessionActive) {
            stream.getTracks().forEach((track) => track.stop());
            return null;
          }

          this.liveDialogueInputStream = stream;
          return stream;
        })
        .catch((error) => {
          this.setError(this.getErrorMessage(error));
          return null;
        })
        .finally(() => {
          this.liveDialogueInputStreamPromise = null;
        });
    }

    return this.liveDialogueInputStreamPromise;
  }

  private stopLiveDialogueInputStream(): void {
    if (this.mediaStream === this.liveDialogueInputStream) {
      this.mediaStream = null;
    }

    if (this.liveBargeInAudioStream === this.liveDialogueInputStream) {
      this.liveBargeInAudioStream = null;
    }

    this.liveDialogueInputStream?.getTracks().forEach((track) => track.stop());
    this.liveDialogueInputStream = null;
    this.liveDialogueInputStreamPromise = null;
  }

  private async startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setError("Voice recording is not available in this Obsidian window.");
      return;
    }

    try {
      this.stopLiveBargeInMonitor();
      this.setError(null);
      this.recordedAudioChunks = [];
      this.mediaStream = this.isLiveDialogueSessionActive
        ? await this.ensureLiveDialogueInputStream()
        : await navigator.mediaDevices.getUserMedia(
            this.getMicrophoneStreamConstraints()
          );

      if (!this.mediaStream) {
        throw new Error("Live Dialogue microphone is not available.");
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          this.recordedAudioChunks.push(event.data);
        }
      });
      this.mediaRecorder.addEventListener("stop", () => {
        void this.handleRecordingStop();
      });
      this.shouldTranscribeRecording = true;
      this.recordingStopMode = "insert";
      this.voiceActivityState = createVoiceActivityState();
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingStartedAt = Date.now();
      this.promptBoxEl?.addClass("is-recording");
      this.startRecordingTimer();
      this.startVoiceLevelMeter(this.mediaStream);
      this.startLiveTranscriptPreview();
      this.statusEl?.setText("Status: Listening");
      this.setSttStatusText("STT: recording...", "busy");
      this.updateMicButton();
      this.updateSendButton();
    } catch (error) {
      this.cleanupRecording();
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Voice unavailable");
      void this.refreshSttStatus();
    }
  }

  private stopRecording(mode: VoiceRecordingStopMode): void {
    this.recordingStopMode = mode;
    this.shouldTranscribeRecording = mode !== "discard";

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
      return;
    }

    this.cleanupRecording();
  }

  private async handleRecordingStop(): Promise<void> {
    const chunks = [...this.recordedAudioChunks];
    const shouldTranscribe = this.shouldTranscribeRecording;
    const stopMode = this.recordingStopMode;
    this.cleanupRecording();

    if (!shouldTranscribe || !chunks.length) {
      if (!shouldTranscribe) {
        this.restoreLiveTranscriptBaseText();
      }
      this.clearLiveTranscriptPreviewState();
      this.statusEl?.setText("Status: Ready");
      void this.refreshSttStatus();
      return;
    }

    const audioBlob = new Blob(chunks, {
      type: chunks[0]?.type || "audio/webm"
    });

    this.isTranscribingVoice = true;
    this.setLoading(true);
    this.updateSendButton();
    this.statusEl?.setText(
      stopMode === "send"
        ? "Status: Transcribing and sending voice"
        : "Status: Transcribing voice"
    );
    this.pushActionTimeline(
      "running",
      stopMode === "send" ? "Transcribing voice to send" : "Transcribing voice"
    );
    this.setSttStatusText("STT: transcribing...", "busy");

    try {
      if (this.plugin.settings.autoStartLocalStt) {
        const isReady = await this.plugin.ensureLocalSttServer(true);

        if (!isReady) {
          throw new Error("Local STT server is not responding.");
        }
      }

      const text = await transcribeAudio(this.plugin.settings, audioBlob);
      this.isTranscribingVoice = false;
      this.setLoading(false);

      if (stopMode === "send") {
        await this.sendTranscribedText(text, {
          liveDialogue: this.isLiveDialogueSessionActive
        });
      } else {
        this.appendTranscribedText(text);
        this.statusEl?.setText("Status: Voice ready");
      }
      this.clearLiveTranscriptPreviewState();
    } catch (error) {
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: Transcription failed");
    } finally {
      this.isTranscribingVoice = false;
      this.setLoading(false);
      this.updateMicButton();
      this.updateSendButton();
      void this.refreshSttStatus();
    }
  }

  private cleanupRecording(): void {
    this.stopLiveTranscriptPreview();
    this.stopVoiceLevelMeter();
    this.stopRecordingTimer();
    this.promptBoxEl?.removeClass("is-recording");

    if (this.mediaStream && this.mediaStream !== this.liveDialogueInputStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedAudioChunks = [];
    this.isRecording = false;
    this.isLiveDialogueTurn = false;
    this.voiceActivityState = createVoiceActivityState();
    this.updateMicButton();
    this.updateLiveDialogueButton();
    this.updateSendButton();
  }

  private startRecordingTimer(): void {
    this.stopRecordingTimer(false);

    if (!this.recordingStartedAt) {
      this.recordingStartedAt = Date.now();
    }

    this.voiceTimerEl?.addClass("is-active");
    this.updateRecordingTimer();
    this.recordingTimerInterval = window.setInterval(() => {
      this.updateRecordingTimer();
    }, 250);
  }

  private stopRecordingTimer(resetStart = true): void {
    if (this.recordingTimerInterval !== null) {
      window.clearInterval(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }

    if (resetStart) {
      this.recordingStartedAt = 0;
    }

    this.voiceTimerEl?.removeClass("is-active");

    if (resetStart && this.voiceTimerEl) {
      this.voiceTimerEl.setText("0:00");
    }
  }

  private updateRecordingTimer(): void {
    if (!this.voiceTimerEl || !this.recordingStartedAt) {
      return;
    }

    this.voiceTimerEl.setText(
      this.voiceController.formatElapsedTime(this.recordingStartedAt)
    );
  }

  private startLiveTranscriptPreview(): void {
    this.stopLiveTranscriptPreview();

    if (!this.inputEl) {
      return;
    }

    const Recognition = this.getSpeechRecognitionConstructor();

    if (!Recognition) {
      return;
    }

    this.liveTranscriptBaseText = this.inputEl.value.trim();
    this.liveTranscriptFinalText = "";
    this.liveTranscriptLastPreview = this.liveTranscriptBaseText;

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getSpeechRecognitionLanguage(
        this.plugin.settings.sttLanguage || "auto"
      );
      recognition.onresult = (event) => {
        let interimText = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript?.trim() ?? "";

          if (!transcript) {
            continue;
          }

          if (result.isFinal) {
            this.liveTranscriptFinalText = [
              this.liveTranscriptFinalText,
              transcript
            ]
              .filter(Boolean)
              .join(" ")
              .trim();
          } else {
            interimText = [interimText, transcript].filter(Boolean).join(" ");
          }
        }

        this.updateLiveTranscriptPreview(interimText);
      };
      recognition.onerror = () => {
        this.stopLiveTranscriptPreview();
      };
      recognition.onend = () => {
        if (this.liveSpeechRecognition === recognition) {
          this.liveSpeechRecognition = null;
        }

        if (this.isRecording && this.shouldTranscribeRecording) {
          window.setTimeout(() => {
            if (this.isRecording && !this.liveSpeechRecognition) {
              this.startLiveTranscriptPreview();
            }
          }, 150);
        }
      };
      recognition.start();
      this.liveSpeechRecognition = recognition;
    } catch (error) {
      console.debug("[Mindo] Live transcript preview unavailable", error);
      this.liveSpeechRecognition = null;
    }
  }

  private updateLiveTranscriptPreview(interimText: string): void {
    if (!this.inputEl) {
      return;
    }

    const nextValue = buildLiveTranscriptValue(
      this.liveTranscriptBaseText,
      interimText,
      this.liveTranscriptFinalText
    );

    if (!nextValue) {
      return;
    }

    this.liveTranscriptLastPreview = nextValue;
    this.inputEl.value = nextValue;
    this.inputEl.scrollTop = this.inputEl.scrollHeight;
    this.refreshLiveDialogueSurface();
  }

  private stopLiveTranscriptPreview(): void {
    const recognition = this.liveSpeechRecognition;
    this.liveSpeechRecognition = null;

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {
      recognition.abort?.();
    }
  }

  private syncLiveBargeInMonitor(): void {
    if (this.shouldKeepLiveBargeInAudioMonitor()) {
      void this.startLiveBargeInAudioMonitor();
    } else {
      this.stopLiveBargeInAudioMonitor();
    }

    if (this.shouldRunLiveBargeInMonitor()) {
      this.startLiveBargeInMonitor();
    } else {
      this.stopLiveBargeInMonitor();
    }
  }

  private shouldKeepLiveBargeInAudioMonitor(): boolean {
    return this.liveDialogueController.shouldKeepBargeInAudioMonitor(
      this.isLiveDialogueSessionActive,
      this.hasLiveAudioTrack(this.liveDialogueInputStream)
    );
  }

  private shouldRunLiveBargeInMonitor(): boolean {
    return Boolean(
      this.isLiveDialogueSessionActive &&
        !this.isRecording &&
        !this.isTranscribingVoice &&
        (this.speakingMessageId || this.isLoading)
    );
  }

  private startLiveBargeInMonitor(): void {
    void this.startLiveBargeInAudioMonitor();

    if (
      this.liveBargeInRecognition ||
      this.liveBargeInRestartTimer !== null ||
      Date.now() < this.liveBargeInDisabledUntil
    ) {
      return;
    }

    const Recognition = this.getSpeechRecognitionConstructor();

    if (!Recognition) {
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getSpeechRecognitionLanguage(
        this.plugin.settings.sttLanguage || "auto"
      );
      recognition.onresult = (event) => {
        let transcript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const resultText = result?.[0]?.transcript?.trim() ?? "";

          if (resultText) {
            transcript = [transcript, resultText].filter(Boolean).join(" ");
          }
        }

        if (transcript) {
          void this.handleLiveBargeInTranscript(transcript);
        }
      };
      recognition.onerror = () => {
        this.liveBargeInDisabledUntil = Date.now() + 2500;
        this.stopLiveBargeInMonitor();
      };
      recognition.onend = () => {
        if (this.liveBargeInRecognition === recognition) {
          this.liveBargeInRecognition = null;
        }

        if (this.shouldRunLiveBargeInMonitor()) {
          this.scheduleLiveBargeInMonitorRestart();
        }
      };
      recognition.start();
      this.liveBargeInRecognition = recognition;
    } catch (error) {
      console.debug("[Mindo] Live barge-in monitor unavailable", error);
      this.liveBargeInRecognition = null;
      this.liveBargeInDisabledUntil = Date.now() + 2500;
    }
  }

  private scheduleLiveBargeInMonitorRestart(): void {
    if (this.liveBargeInRestartTimer !== null) {
      return;
    }

    this.liveBargeInRestartTimer = window.setTimeout(() => {
      this.liveBargeInRestartTimer = null;
      this.syncLiveBargeInMonitor();
    }, 350);
  }

  private stopLiveBargeInMonitor(): void {
    if (this.liveBargeInRestartTimer !== null) {
      window.clearTimeout(this.liveBargeInRestartTimer);
      this.liveBargeInRestartTimer = null;
    }

    const recognition = this.liveBargeInRecognition;
    this.liveBargeInRecognition = null;

    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {
      recognition.abort?.();
    }
  }

  private async startLiveBargeInAudioMonitor(): Promise<void> {
    if (this.liveBargeInAnalyser) {
      if (this.liveBargeInAnimationFrame === null) {
        this.animateLiveBargeInAudioMonitor();
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = this.isLiveDialogueSessionActive
        ? await this.ensureLiveDialogueInputStream()
        : await navigator.mediaDevices.getUserMedia(
            this.getMicrophoneStreamConstraints()
          );

      if (!stream) {
        return;
      }

      if (!this.shouldKeepLiveBargeInAudioMonitor()) {
        if (stream !== this.liveDialogueInputStream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      this.liveBargeInAudioStream = stream;
      this.liveBargeInAudioContext = new AudioContext();
      if (this.liveBargeInAudioContext.state === "suspended") {
        await this.liveBargeInAudioContext.resume();
      }
      this.liveBargeInAnalyser = this.liveBargeInAudioContext.createAnalyser();
      this.liveBargeInAnalyser.fftSize = 256;
      this.liveBargeInAudioSource =
        this.liveBargeInAudioContext.createMediaStreamSource(stream);
      this.liveBargeInAudioSource.connect(this.liveBargeInAnalyser);
      this.liveBargeInVoiceActivityState = createVoiceActivityState();
      this.animateLiveBargeInAudioMonitor();
    } catch (error) {
      console.debug("[Mindo] Live barge-in audio monitor unavailable", error);
    }
  }

  private animateLiveBargeInAudioMonitor(): void {
    if (!this.liveBargeInAnalyser || !this.shouldKeepLiveBargeInAudioMonitor()) {
      this.liveBargeInAnimationFrame = null;
      return;
    }

    const data = new Uint8Array(this.liveBargeInAnalyser.frequencyBinCount);
    this.liveBargeInAnalyser.getByteTimeDomainData(data);
    const normalized = getNormalizedAudioLevelFromTimeDomainData(data);
    const now = Date.now();

    if (!this.shouldRunLiveBargeInMonitor()) {
      this.liveBargeInVoiceActivityState = createVoiceActivityState();
      this.liveBargeInAnimationFrame = window.requestAnimationFrame(() => {
        this.animateLiveBargeInAudioMonitor();
      });
      return;
    }

    this.liveBargeInVoiceActivityState = reduceVoiceActivity(
      this.liveBargeInVoiceActivityState,
      {
        type: "level",
        now,
        level: normalized,
        ...LIVE_BARGE_IN_VOICE_ACTIVITY
      }
    );

    if (
      this.liveDialogueController.shouldInterruptFromAudio(
        {
          isLiveDialogueActive: this.isLiveDialogueSessionActive,
          isAssistantBusy: Boolean(this.speakingMessageId || this.isLoading),
          isRecording: this.isRecording,
          isTranscribingVoice: this.isTranscribingVoice,
          isAlreadyHandling: this.isHandlingLiveBargeIn,
          now,
          lastHandledAt: this.liveBargeInLastHandledAt
        },
        this.liveBargeInVoiceActivityState
      )
    ) {
      void this.handleLiveBargeInVoiceDetected();
      return;
    }

    this.liveBargeInAnimationFrame = window.requestAnimationFrame(() => {
      this.animateLiveBargeInAudioMonitor();
    });
  }

  private stopLiveBargeInAudioMonitor(): void {
    if (this.liveBargeInAnimationFrame !== null) {
      window.cancelAnimationFrame(this.liveBargeInAnimationFrame);
      this.liveBargeInAnimationFrame = null;
    }

    if (
      this.liveBargeInAudioStream &&
      this.liveBargeInAudioStream !== this.liveDialogueInputStream
    ) {
      this.liveBargeInAudioStream.getTracks().forEach((track) => track.stop());
    }

    this.liveBargeInAudioStream = null;
    this.liveBargeInAudioSource?.disconnect();
    this.liveBargeInAudioSource = null;
    void this.liveBargeInAudioContext?.close();
    this.liveBargeInAudioContext = null;
    this.liveBargeInAnalyser = null;
    this.liveBargeInVoiceActivityState = createVoiceActivityState();
  }

  private async handleLiveBargeInVoiceDetected(): Promise<void> {
    if (this.isHandlingLiveBargeIn || !this.shouldRunLiveBargeInMonitor()) {
      return;
    }

    this.isHandlingLiveBargeIn = true;
    this.liveBargeInLastHandledAt = Date.now();
    this.stopLiveBargeInMonitor();
    this.stopLiveDialogueAcknowledgement();
    this.statusEl?.setText("Status: Interrupted");
    this.setContextDetail("Live interruption: listening", false);

    if (this.isLoading) {
      this.cancelCurrentGeneration({ restorePendingUser: false });
    } else if (this.speakingMessageId) {
      this.stopSpeaking();
      void this.renderMessages();
    }

    try {
      await this.startLiveDialogueListening();
    } finally {
      this.isHandlingLiveBargeIn = false;
      this.syncLiveBargeInMonitor();
    }
  }

  private async handleLiveBargeInTranscript(transcript: string): Promise<void> {
    if (this.isHandlingLiveBargeIn) {
      return;
    }

    const now = Date.now();
    const assistantText = [
      getLiveDialogueLatestAssistantText({
        messages: this.messages,
        streamingMessageId: this.streamingMessageId
      }),
      this.liveAcknowledgementSpeechText
    ]
      .filter(Boolean)
      .join(" ");

    if (
      !shouldHandleLiveBargeIn({
        transcript,
        assistantText,
        isLiveDialogueActive: this.isLiveDialogueSessionActive,
        isAssistantBusy: Boolean(this.speakingMessageId || this.isLoading),
        isRecording: this.isRecording,
        now,
        lastHandledAt: this.liveBargeInLastHandledAt
      })
    ) {
      return;
    }

    const nextPrompt = transcript.replace(/\s+/g, " ").trim();

    if (!nextPrompt) {
      return;
    }

    this.isHandlingLiveBargeIn = true;
    this.liveBargeInLastHandledAt = now;
    this.stopLiveBargeInMonitor();
    this.statusEl?.setText("Status: Interrupted");
    this.setContextDetail(`Live interruption: ${trimTextForContext(nextPrompt, 80)}`, false);

    if (this.isLoading) {
      this.cancelCurrentGeneration({ restorePendingUser: false });
    } else if (this.speakingMessageId) {
      this.stopSpeaking();
      void this.renderMessages();
    }

    if (isLiveStopOnlyCommand(nextPrompt)) {
      this.statusEl?.setText("Status: Live Dialogue interrupted");
      this.setContextDetail("Live interruption: stopped", false);
      this.clearLiveTranscriptPreviewState();
      this.isHandlingLiveBargeIn = false;
      this.syncLiveBargeInMonitor();
      return;
    }

    if (this.inputEl) {
      this.inputEl.disabled = false;
      this.inputEl.value = nextPrompt;
    }

    try {
      await this.sendUserMessage({ liveDialogue: true });
    } finally {
      this.isHandlingLiveBargeIn = false;
      this.syncLiveBargeInMonitor();
    }
  }

  private clearLiveTranscriptPreviewState(): void {
    this.liveTranscriptBaseText = "";
    this.liveTranscriptFinalText = "";
    this.liveTranscriptLastPreview = "";
  }

  private restoreLiveTranscriptBaseText(): void {
    if (this.inputEl) {
      this.inputEl.value = this.liveTranscriptBaseText;
    }
  }

  private getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    return (
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition ??
      null
    );
  }

  private startVoiceLevelMeter(stream: MediaStream): void {
    this.stopVoiceLevelMeter();

    try {
      this.audioContext = new AudioContext();
      this.audioAnalyser = this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = 256;
      this.audioContext.createMediaStreamSource(stream).connect(this.audioAnalyser);
      this.voiceWaveformEl?.addClass("is-active");
      this.animateVoiceLevelMeter();
    } catch (error) {
      console.warn("[Mindo] Voice level meter unavailable", error);
    }
  }

  private animateVoiceLevelMeter(): void {
    if (!this.audioAnalyser || !this.voiceWaveformBars.length) {
      return;
    }

    const data = new Uint8Array(this.audioAnalyser.frequencyBinCount);
    this.audioAnalyser.getByteTimeDomainData(data);
    const normalized = getNormalizedAudioLevelFromTimeDomainData(data);
    this.updateVoiceActivity(normalized);
    this.liveDialogueOrbEl?.style.setProperty(
      "--contex-live-scale",
      (1 + normalized * 0.16).toFixed(3)
    );
    this.liveDialogueOrbEl?.style.setProperty(
      "--contex-live-glow",
      (0.06 + normalized * 0.18).toFixed(3)
    );

    this.voiceWaveformBars.forEach((bar, index) => {
      const distanceFromCenter = Math.abs(index - (this.voiceWaveformBars.length - 1) / 2);
      const centerWeight = 1 - distanceFromCenter / this.voiceWaveformBars.length;
      const scale = 0.35 + normalized * (0.65 + centerWeight);
      bar.style.transform = `scaleY(${Math.max(0.25, scale).toFixed(2)})`;
      bar.style.opacity = `${0.45 + normalized * 0.55}`;
    });

    this.audioLevelAnimationFrame = window.requestAnimationFrame(() => {
      this.animateVoiceLevelMeter();
    });
  }

  private updateVoiceActivity(level: number): void {
    if (
      !this.isRecording ||
      !this.isLiveDialogueSessionActive ||
      !this.isLiveDialogueTurn ||
      this.recordingStopMode !== "insert"
    ) {
      return;
    }

    this.voiceActivityState = reduceVoiceActivity(this.voiceActivityState, {
      type: "level",
      now: Date.now(),
      level,
      ...LIVE_TURN_VOICE_ACTIVITY
    });

    if (
      this.voiceActivityState.shouldAutoStop &&
      this.mediaRecorder &&
      this.mediaRecorder.state !== "inactive"
    ) {
      this.stopRecording("send");
    }
  }

  private stopVoiceLevelMeter(): void {
    if (this.audioLevelAnimationFrame !== null) {
      window.cancelAnimationFrame(this.audioLevelAnimationFrame);
      this.audioLevelAnimationFrame = null;
    }

    this.voiceWaveformEl?.removeClass("is-active");
    this.voiceWaveformBars.forEach((bar) => {
      bar.style.transform = "";
      bar.style.opacity = "";
    });
    this.liveDialogueOrbEl?.style.removeProperty("--contex-live-scale");
    this.liveDialogueOrbEl?.style.removeProperty("--contex-live-glow");
    void this.audioContext?.close();
    this.audioContext = null;
    this.audioAnalyser = null;
  }

  private async handleLocalCommandText(text: string): Promise<boolean> {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return false;
    }

    const action = await this.resolveLocalCommandAction(trimmedText);

    if (!action) {
      const commandText = normalizeNoisyLocalCommandText(trimmedText);
      const effectiveCommandText = getEffectiveLocalCommandText(commandText);

      if (
        shouldPreventLocalCommandChatFallbackFromRouter(commandText) ||
        shouldPreventLocalCommandChatFallbackFromRouter(effectiveCommandText)
      ) {
        this.appendActionReceipt(
          {
            status: "failed",
            label: "Action not resolved",
            detail:
              "I understood this as a vault action, but could not safely resolve the exact file, note, or edit target."
          },
          trimmedText
        );
        this.statusEl?.setText("Status: Action not resolved");
        return true;
      }

      return false;
    }

    console.debug("[Mindo] Local command action", {
      text: trimmedText,
      action
    });
    const liveAcknowledgementKind =
      this.getLiveDialogueAcknowledgementKindForAction(action);

    if (liveAcknowledgementKind) {
      void this.playLiveDialogueAcknowledgement(liveAcknowledgementKind);
    }

    const messageCountBeforeAction = this.messages.length;
    await this.executeLocalCommandAction(action);
    const errorMessage = this.errorEl?.textContent?.trim();

    if (this.messages.length === messageCountBeforeAction && errorMessage) {
      this.appendActionReceipt(
        {
          status: "failed",
          label: "Action failed",
          detail: errorMessage
        },
        trimmedText
      );
    }

    return true;
  }

  private getLiveDialogueAcknowledgementKindForAction(
    action: LocalCommandAction
  ): LiveDialogueAcknowledgementKind | null {
    if (!this.isLiveDialogueSessionActive) {
      return null;
    }

    if (action.kind === "action-plan") {
      return action.actions
        .map((step) => this.getLiveDialogueAcknowledgementKindForAction(step))
        .find((kind): kind is LiveDialogueAcknowledgementKind => Boolean(kind)) ??
        "thinking";
    }

    switch (action.kind) {
      case "open-file":
      case "open-last-file":
        return "opening";
      case "research-web":
      case "research-note":
      case "semantic-vault":
      case "search-vault":
        return "researching";
      case "replace-text":
      case "replace-multiple":
      case "replace-selection-or-line":
      case "apply-diff":
      case "reject-diff":
      case "refine-diff":
      case "undo-diff":
      case "improve-selection":
      case "create-note":
      case "note-action":
        return "editing";
      case "attach-last-results":
      case "read-last-answer":
      case "stop-speaking":
      case "summarize-last-file":
      default:
        return "thinking";
    }
  }

  private async resolveLocalCommandAction(
    trimmedText: string
  ): Promise<LocalCommandAction | null> {
    const commandText = normalizeNoisyLocalCommandText(trimmedText);
    const effectiveCommandText = getEffectiveLocalCommandText(commandText);
    const createCommandText =
      extractCreateNoteCommandSegment(effectiveCommandText) ??
      (effectiveCommandText !== commandText
        ? null
        : extractCreateNoteCommandSegment(commandText));

    if (isVoiceStopSpeakingCommand(effectiveCommandText)) {
      return {
        kind: "stop-speaking"
      };
    }

    if (isVoiceReadLastAnswerCommand(effectiveCommandText)) {
      return {
        kind: "read-last-answer"
      };
    }

    const pendingDiffMessage = this.findLatestDiffMessage("pending");

    if (pendingDiffMessage && isVoiceAcceptCommand(effectiveCommandText)) {
      return {
        kind: "apply-diff",
        messageId: pendingDiffMessage.id
      };
    }

    if (pendingDiffMessage && isVoiceRejectCommand(effectiveCommandText)) {
      return {
        kind: "reject-diff",
        messageId: pendingDiffMessage.id
      };
    }

    if (pendingDiffMessage) {
      const refineInstruction = extractVoiceRefineInstruction(effectiveCommandText);

      if (refineInstruction) {
        return {
          kind: "refine-diff",
          messageId: pendingDiffMessage.id,
          instruction: refineInstruction
        };
      }
    }

    const appliedDiffMessage = this.findLatestDiffMessage("applied");

    if (appliedDiffMessage && isVoiceUndoCommand(effectiveCommandText)) {
      return {
        kind: "undo-diff",
        messageId: appliedDiffMessage.id
      };
    }

    if (isVoiceImproveSelectionCommand(effectiveCommandText)) {
      return {
        kind: "improve-selection"
      };
    }

    const deterministicOpenFileQuery = parseVoiceOpenFileQuery(effectiveCommandText);
    const shouldTryDeterministicOpen =
      Boolean(deterministicOpenFileQuery) &&
      (isPlainOpenFileCommand(effectiveCommandText) ||
        isBareOpenFileCorrection(effectiveCommandText));
    const deterministicOpenFileCandidate =
      shouldTryDeterministicOpen && deterministicOpenFileQuery
        ? this.resolveOpenFileCandidate(deterministicOpenFileQuery)
        : null;

    if (
      deterministicOpenFileQuery &&
      shouldTryDeterministicOpen &&
      deterministicOpenFileCandidate
    ) {
      return {
        kind: "open-file",
        commandText: trimmedText,
        query: deterministicOpenFileQuery
      };
    }

    if (createCommandText && isResearchNoteCommand(createCommandText)) {
      return {
        kind: "research-note",
        commandText: createCommandText,
        displayText: trimmedText
      };
    }

    if (createCommandText && isCreateNoteCommand(createCommandText)) {
      return {
        kind: "create-note",
        commandText: createCommandText,
        displayText: trimmedText
      };
    }

    const shouldTrySemanticAction = shouldRouteThroughSemanticIntentRouter(
      commandText,
      effectiveCommandText,
      createCommandText
    );

    if (shouldTrySemanticAction) {
      const semanticAction = await this.resolveSemanticLocalCommandAction(
        commandText,
        effectiveCommandText
      );

      if (semanticAction) {
        return semanticAction;
      }
    }

    const textReplacement = extractVoiceTextReplacement(effectiveCommandText);

    if (textReplacement) {
      return {
        kind: "replace-text",
        commandText: trimmedText,
        replacement: textReplacement
      };
    }

    const replacement = extractVoiceReplacement(effectiveCommandText);

    if (replacement) {
      return {
        kind: "replace-selection-or-line",
        commandText: trimmedText,
        suggested: replacement
      };
    }

    const noteAction = parseVoiceNoteAction(effectiveCommandText);

      if (noteAction) {
        return {
          kind: "note-action",
          action: noteAction,
          commandText: effectiveCommandText
        };
      }

    if (isResearchNoteCommand(effectiveCommandText)) {
      return {
        kind: "research-note",
        commandText: effectiveCommandText,
        displayText: trimmedText
      };
    }

    if (isCreateNoteCommand(effectiveCommandText)) {
      return {
        kind: "create-note",
        commandText: effectiveCommandText,
        displayText: trimmedText
      };
    }

    if (isOpenLastFileReference(effectiveCommandText)) {
      return {
        kind: "open-last-file",
        commandText: trimmedText
      };
    }

    const openFileQuery =
      deterministicOpenFileQuery ?? parseVoiceOpenFileQuery(effectiveCommandText);

    if (openFileQuery) {
      if (
        shouldTrySemanticAction &&
        shouldTryDeterministicOpen &&
        !deterministicOpenFileCandidate
      ) {
        return null;
      }

      return {
        kind: "open-file",
        commandText: trimmedText,
        query: openFileQuery
      };
    }

    const webResearchQuery = parseVoiceWebResearchQuery(effectiveCommandText);

    if (webResearchQuery) {
      return {
        kind: "research-web",
        query: webResearchQuery
      };
    }

    const semanticVaultQuery = parseVoiceSemanticVaultQuery(effectiveCommandText);

    if (semanticVaultQuery) {
      return {
        kind: "semantic-vault",
        query: semanticVaultQuery
      };
    }

    const vaultSearchQuery = parseVoiceVaultSearchQuery(effectiveCommandText);

    if (vaultSearchQuery) {
      return {
        kind: "search-vault",
        query: vaultSearchQuery
      };
    }

    const memoryIntent = parseVoiceMemoryIntent(effectiveCommandText);

    if (memoryIntent === "summarize-last-file") {
      return {
        kind: "summarize-last-file",
        commandText: trimmedText
      };
    }

    if (memoryIntent === "open-last-file") {
      return {
        kind: "open-last-file"
      };
    }

    if (memoryIntent === "attach-last-results") {
      return {
        kind: "attach-last-results"
      };
    }

    return null;
  }

  private async executeLocalCommandAction(
    action: LocalCommandAction
  ): Promise<void> {
    switch (action.kind) {
      case "action-plan":
        await this.executeLocalCommandActionPlan(action);
        return;
      case "replace-text":
        await this.previewVoiceTextReplacement(
          action.commandText,
          action.replacement
        );
        return;
      case "replace-multiple":
        await this.previewVoiceMultiTextReplacement(
          action.commandText,
          action.replacements
        );
        return;
      case "replace-selection-or-line":
        await this.previewVoiceReplacementOrCurrentNoteLine(
          action.commandText,
          action.suggested
        );
        return;
      case "apply-diff":
        await this.applyDiffPreview(action.messageId);
        return;
      case "reject-diff":
        this.rejectDiffPreview(action.messageId);
        return;
      case "refine-diff":
        await this.refineDiffPreview(action.messageId, action.instruction);
        return;
      case "undo-diff":
        await this.undoDiffPreview(action.messageId);
        return;
      case "improve-selection": {
        const contextResult = this.readSelectedTextContextForVoice();

        if (!contextResult.context) {
          this.setError(contextResult.warning);
          this.statusEl?.setText("Status: No selected text");
          return;
        }

        await this.sendSelectedTextImprovement(contextResult.context);
        return;
      }
      case "open-last-file":
        await this.openLastFoundFile(action.commandText);
        return;
      case "open-file":
        await this.openFileByVaultQuery(action.query, action.commandText);
        return;
      case "search-vault":
        await this.sendVaultSearch(action.query);
        return;
      case "semantic-vault":
        await this.sendSemanticVaultQuestion(action.query);
        return;
      case "research-web":
        await this.sendWebResearch(action.query);
        return;
      case "research-note":
        await this.createResearchNoteFromCommandText(
          action.commandText,
          action.displayText ?? action.commandText
        );
        return;
      case "summarize-last-file":
        await this.answerFromLastFoundFile(action.commandText);
        return;
      case "attach-last-results":
        this.attachLastFoundFiles();
        return;
      case "create-note":
        await this.createNoteFromCommandText(
          action.commandText,
          action.displayText ?? action.commandText
        );
        return;
      case "read-last-answer":
        await this.speakLatestAssistantMessage();
        return;
      case "stop-speaking":
        this.stopSpeaking();
        this.statusEl?.setText("Status: Ready");
        void this.renderMessages();
        return;
      case "note-action":
        if (action.action === "remember") {
          await this.rememberCurrentNote();
        } else if (action.action === "roadmap") {
          await this.createRoadmapFromCurrentNote();
        } else if (action.action === "chat-note") {
          await this.saveCurrentChatAsNote();
        } else {
          await this.updateCurrentNote(action.commandText);
        }
    }
  }

  private async executeLocalCommandActionPlan(
    plan: Extract<LocalCommandAction, { kind: "action-plan" }>
  ): Promise<void> {
    console.debug("[Mindo] Executing local action plan", plan);
    this.setError(null);

    for (let index = 0; index < plan.actions.length; index += 1) {
      const action = plan.actions[index];

      this.statusEl?.setText(
        `Status: Running step ${index + 1}/${plan.actions.length}`
      );
      await this.executeLocalCommandAction(action);

      const errorMessage = this.errorEl?.textContent?.trim();

      if (errorMessage) {
        console.warn("[Mindo] Local action plan stopped", {
          step: index + 1,
          action,
          errorMessage
        });
        break;
      }
    }
  }

  private async resolveSemanticLocalCommandAction(
    commandText: string,
    effectiveCommandText?: string
  ): Promise<LocalCommandAction | null> {
    this.statusEl?.setText("Status: Understanding command");

    try {
      const commands = await this.classifySemanticLocalCommandPlan(
        commandText,
        effectiveCommandText
      );
      const completedCommands = completeOpenThenReplacePlan(
        commands ?? [],
        effectiveCommandText ?? commandText
      );
      const actions = completedCommands
        ?.map((command) =>
          semanticCommandToLocalAction(command, commandText)
        )
        .filter((action): action is LocalCommandAction => Boolean(action)) ?? [];

      if (!actions.length) {
        return null;
      }

      return actions.length === 1
        ? actions[0]
        : {
            kind: "action-plan",
            commandText,
            actions
          };
    } catch (error) {
      console.warn("[Mindo] Semantic local command failed", error);
      this.statusEl?.setText("Status: Ready");
      return null;
    }
  }

  private async trySemanticLocalCommand(commandText: string): Promise<boolean> {
    this.statusEl?.setText("Status: Understanding command");

    try {
      const command = await this.classifySemanticLocalCommand(commandText);

      if (!command || command.action === "none") {
        return false;
      }

      if (command.action === "replace_text") {
        const replacements = command.replacements?.length
          ? command.replacements
          : command.original && command.suggested
            ? [
                {
                  original: command.original,
                  suggested: command.suggested
                }
              ]
            : [];

        if (!replacements.length) {
          return false;
        }

        if (replacements.length === 1) {
          await this.previewVoiceTextReplacement(commandText, replacements[0]);
          return true;
        }

        await this.previewVoiceMultiTextReplacement(commandText, replacements);
        return true;
      }

      if (command.action === "replace_selection" && command.suggested) {
        await this.previewVoiceReplacementOrCurrentNoteLine(
          commandText,
          command.suggested
        );
        return true;
      }

      if (command.action === "open_file" && command.query) {
        await this.openFileByVaultQuery(command.query, commandText);
        return true;
      }

      if (command.action === "open_last_file") {
        await this.openLastFoundFile(commandText);
        return true;
      }

      if (command.action === "search_vault" && command.query) {
        await this.sendVaultSearch(command.query);
        return true;
      }

      if (command.action === "semantic_vault" && command.query) {
        await this.sendSemanticVaultQuestion(command.query);
        return true;
      }

      if (command.action === "research_web" && command.query) {
        await this.sendWebResearch(command.query);
        return true;
      }

      if (command.action === "research_note") {
        await this.createResearchNoteFromCommandText(commandText, commandText);
        return true;
      }

      if (command.action === "create_note") {
        await this.createNoteFromCommand(commandText);
        return true;
      }

      if (command.action === "update_note") {
        await this.updateCurrentNote(commandText);
        return true;
      }

      if (command.action === "read_last_answer") {
        await this.speakLatestAssistantMessage();
        return true;
      }

      if (command.action === "stop_speaking") {
        this.stopSpeaking();
        this.statusEl?.setText("Status: Ready");
        void this.renderMessages();
        return true;
      }

      return false;
    } catch (error) {
      console.warn("[Mindo] Semantic local command failed", error);
      this.statusEl?.setText("Status: Ready");
      return false;
    }
  }

  private async classifySemanticLocalCommand(
    commandText: string,
    effectiveCommandText?: string
  ): Promise<SemanticLocalCommand | null> {
    const commands = await this.classifySemanticLocalCommandPlan(
      commandText,
      effectiveCommandText
    );

    return commands?.[0] ?? null;
  }

  private buildVaultCandidatePromptContext(
    commandText: string,
    effectiveCommandText?: string
  ): string {
    const queryCandidates = Array.from(
      new Set(
        [
          effectiveCommandText,
          commandText,
          effectiveCommandText ? parseVoiceOpenFileQuery(effectiveCommandText) : null,
          parseVoiceOpenFileQuery(commandText),
          effectiveCommandText ? extractRequestedFolderName(effectiveCommandText) : null,
          extractRequestedFolderName(commandText)
        ]
          .map((query) => query?.trim() ?? "")
          .filter((query) => query.length >= 2)
      )
    );
    const files = this.app.vault.getMarkdownFiles();
    const fileCandidates = files
      .map((file) => ({
        file,
        score: Math.max(
          ...queryCandidates.map((query) => {
            const parts = parseOpenFileResolverQueryParts(query);
            return scoreOpenFilePathCandidate(
              file.path,
              parts.fileQuery,
              parts.folderQuery
            );
          }),
          0
        )
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 16);
    const scoredFilePaths = new Set(
      fileCandidates.map((candidate) => candidate.file.path)
    );
    const activePath = this.app.workspace.getActiveFile()?.path ?? "";
    const relatedFolders = new Set(
      [
        activePath,
        ...this.findLastMentionedMarkdownPaths().slice(0, 5),
        ...this.voiceSessionMemory.lastFoundFiles
          .slice(0, 6)
          .map((result) => result.path)
      ]
        .map((path) => getFolderPath(path))
        .filter(Boolean)
    );
    const contextNearFiles = relatedFolders.size
      ? files
          .filter(
            (file) =>
              !scoredFilePaths.has(file.path) &&
              relatedFolders.has(getFolderPath(file.path))
          )
          .sort((left, right) => left.path.localeCompare(right.path))
          .slice(0, 24)
      : [];
    const folders = Array.from(
      new Set(files.map((file) => getFolderPath(file.path)).filter(Boolean))
    );
    const scoredFolderCandidates = folders
      .map((folder) => ({
        folder,
        score: Math.max(
          ...queryCandidates.map((query) =>
            scoreVaultFolderCandidate(folder, normalizeOpenFileValue(query))
          ),
          0
        )
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
    const folderCandidates = scoredFolderCandidates.length
      ? scoredFolderCandidates
      : folders
          .sort((left, right) => left.localeCompare(right))
          .slice(0, 20)
          .map((folder) => ({
            folder,
            score: 0
          }));

    return [
      "Vault candidates from the user's real Obsidian vault:",
      "If an action needs a file or folder, prefer one of these exact paths/names instead of inventing a path.",
      "",
      "Folder candidates:",
      folderCandidates.length
        ? folderCandidates
            .map(
              (candidate, index) =>
                `${index + 1}. ${candidate.folder} (score ${candidate.score})`
            )
            .join("\n")
        : "(none)",
      "",
      "File candidates:",
      fileCandidates.length
        ? fileCandidates
            .map(
              (candidate, index) =>
                `${index + 1}. ${candidate.file.path} (title: ${candidate.file.basename}, folder: ${getFolderPath(candidate.file.path) || "/"}, score ${candidate.score})`
            )
            .join("\n")
        : "(none)",
      "",
      "Context-near file candidates:",
      contextNearFiles.length
        ? contextNearFiles
            .map(
              (file, index) =>
                `${index + 1}. ${file.path} (title: ${file.basename}, folder: ${getFolderPath(file.path) || "/"})`
            )
            .join("\n")
        : "(none)"
    ].join("\n");
  }

  private async classifySemanticLocalCommandPlan(
    commandText: string,
    effectiveCommandText?: string
  ): Promise<SemanticLocalCommand[] | null> {
    const note = await this.readActiveMarkdownNote();
    const mentionedPaths = this.findLastMentionedMarkdownPaths().slice(0, 5);
    const lastResults = this.voiceSessionMemory.lastFoundFiles.slice(0, 6);
    const routerUserText =
      effectiveCommandText && effectiveCommandText !== commandText
        ? `${commandText}\nCorrected/latest command segment: ${effectiveCommandText}`
        : commandText;
    const routerCandidates = collectVaultCandidates(
      this.app,
      routerUserText,
      24
    );
    const toolRouterContext = buildToolRouterPrompt({
      userText: routerUserText,
      activeNotePath: note?.file.path ?? null,
      candidates: routerCandidates
    });
    const vaultCandidateContext = this.buildVaultCandidatePromptContext(
      commandText,
      effectiveCommandText
    );
    const prompt = [
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
      '{"action":"open_file","query":"..."}',
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
      "- For open_file, if a file candidate is clearly intended, return its exact vault path in query.",
      "- For open_file, use the listed File candidates and Context-near file candidates as the ground truth. Resolve fuzzy speech by comparing meaning, title, folder, active note, and recent context; do not rely on a fixed language-specific alias list.",
      "- For open_file, do not substitute the active/current note when the user names a different file. Use the closest spoken filename candidate, or keep the user's requested title in query if no candidate is clear.",
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
      toolRouterContext,
      "",
      `Active note path: ${note?.file.path ?? "(none)"}`,
      "Active note excerpt:",
      note?.content.slice(0, 4000) ?? "",
      "",
      "Recently mentioned note paths:",
      mentionedPaths.join("\n") || "(none)",
      "",
      "Last vault search results:",
      lastResults
        .map((result, index) => `${index + 1}. ${result.path}`)
        .join("\n") || "(none)",
      "",
      vaultCandidateContext,
      "",
      "User command:",
      commandText,
      effectiveCommandText && effectiveCommandText !== commandText
        ? ["", "Corrected/latest command segment:", effectiveCommandText].join("\n")
        : ""
    ].join("\n");
    const response = await requestLlmChatCompletion(this.plugin.settings, [
      {
        id: `${Date.now()}-semantic-local-command`,
        role: "user",
        content: prompt,
        createdAt: Date.now()
      }
    ]);

    return parseSemanticLocalCommandPlan(response);
  }

  private async previewVoiceReplacement(
    commandText: string,
    replacement: string
  ): Promise<void> {
    const contextResult = this.readSelectedTextContextForVoice();

    if (!contextResult.context) {
      this.setError(contextResult.warning);
      this.statusEl?.setText("Status: No selected text");
      return;
    }

    const selectedContext = contextResult.context;

    if (selectedContext.isTruncated) {
      this.setError(
        "Selected text is too long for a safe voice replacement. Select a smaller passage."
      );
      this.statusEl?.setText("Status: Selection too long");
      return;
    }

    const sourceFile = this.app.vault.getAbstractFileByPath(
      selectedContext.path
    );

    if (!(sourceFile instanceof TFile)) {
      this.setError(`Could not find source note: ${selectedContext.path}`);
      this.statusEl?.setText("Status: Preview failed");
      return;
    }

    const suggested = cleanSuggestedReplacement(
      stripHiddenTtsHints(replacement)
    );

    if (!suggested) {
      this.setError("Voice replacement text is empty.");
      this.statusEl?.setText("Status: Preview failed");
      return;
    }

    const sourceContent = await this.app.vault.cachedRead(sourceFile);
    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: commandText,
      createdAt: Date.now()
    };
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length + 1}`,
      role: "assistant",
      content: suggested,
      createdAt: Date.now(),
      diffPreview: buildTextReplacementDiffPreview({
        title: "Voice replacement preview",
        sourcePath: selectedContext.path,
        originalOccurrenceIndex: getUniqueOccurrenceIndex(
          sourceContent,
          selectedContext.text
        ),
        original: selectedContext.text,
        suggested,
        operationType: "voice-replace-selection",
        userPrompt: commandText
      })
    };

    this.setError(null);
    this.messages.push(userMessage, assistantMessage);
    this.statusEl?.setText("Status: Preview ready");
    void this.showInlineDiffForMessage(assistantMessage.id);
    void this.renderMessages();
    this.queueAutoApplyDiffPreview(assistantMessage.id);
  }

  private async previewVoiceReplacementOrCurrentNoteLine(
    commandText: string,
    replacement: string
  ): Promise<void> {
    const contextResult = this.readSelectedTextContextForVoice();

    if (contextResult.context) {
      await this.previewVoiceReplacement(commandText, replacement);
      return;
    }

    const note = await this.readActiveMarkdownNote();
    const target = note ? inferCurrentNoteReplacementTarget(note.content) : null;

    if (!note || !target) {
      this.setError(
        contextResult.warning ??
          "Select text or make the target phrase explicit before replacing it."
      );
      this.statusEl?.setText("Status: No replacement target");
      return;
    }

    await this.previewVoiceTextReplacement(commandText, {
      original: target,
      suggested: replacement
    });
  }

  private async previewVoiceTextReplacement(
    commandText: string,
    replacement: VoiceTextReplacement
  ): Promise<void> {
    const note = await this.readActiveMarkdownNote();

    if (!note) {
      this.setError("Open a Markdown note before replacing text by voice.");
      this.statusEl?.setText("Status: No current note");
      return;
    }

    const suggested = cleanSuggestedReplacement(
      stripHiddenTtsHints(replacement.suggested)
    );

    if (!replacement.original || !suggested) {
      this.setError("Voice replacement command did not include both old and new text.");
      this.statusEl?.setText("Status: Preview failed");
      return;
    }

    const occurrence = await this.findUniqueTextOccurrenceForPreview(
      note.content,
      replacement.original
    );

    if (occurrence.error || !occurrence.match) {
      this.setError(occurrence.error);
      this.statusEl?.setText("Status: Preview failed");
      return;
    }

    const occurrenceMatch = occurrence.match;
    const original = occurrenceMatch.original;
    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: commandText,
      createdAt: Date.now()
    };
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length + 1}`,
      role: "assistant",
      content: suggested,
      createdAt: Date.now(),
      diffPreview: buildTextReplacementDiffPreview({
        title: "Voice text replacement preview",
        sourcePath: note.file.path,
        originalOccurrenceIndex: occurrenceMatch.occurrenceIndex,
        original,
        suggested,
        operationType: "voice-replace-text",
        userPrompt: commandText
      })
    };

    this.setError(null);
    this.messages.push(userMessage, assistantMessage);
    this.statusEl?.setText("Status: Preview ready");
    void this.showInlineDiffForMessage(assistantMessage.id);
    void this.renderMessages();
    this.queueAutoApplyDiffPreview(assistantMessage.id);
  }

  private async findUniqueTextOccurrenceForPreview(
    content: string,
    requestedText: string
  ): Promise<
    | { match: TextOccurrenceMatch; error: null }
    | { match: null; error: string }
  > {
    const rustOccurrence = await findTextOccurrenceWithRustCore({
      content,
      requestedText,
      pluginDir: __dirname
    });

    if (rustOccurrence?.match) {
      return {
        match: {
          original: rustOccurrence.match.original,
          occurrenceIndex: rustOccurrence.match.occurrenceIndex
        },
        error: null
      };
    }

    if (rustOccurrence?.error) {
      return {
        match: null,
        error: rustOccurrence.error
      };
    }

    return findUniqueTextOccurrence(content, requestedText);
  }

  private async previewVoiceMultiTextReplacement(
    commandText: string,
    replacements: VoiceTextReplacement[]
  ): Promise<void> {
    const note = await this.readActiveMarkdownNote();

    if (!note) {
      this.setError("Open a Markdown note before replacing text by voice.");
      this.statusEl?.setText("Status: No current note");
      return;
    }

    if (note.content.length > MAX_WHOLE_NOTE_UPDATE_CHARS) {
      this.setError(
        "The active note is too long for a safe multi-replacement preview. Select a smaller section or make one replacement at a time."
      );
      this.statusEl?.setText("Status: Note too long");
      return;
    }

    let nextContent = note.content;

    for (const replacement of replacements) {
      const original = cleanVoiceReplacementText(replacement.original);
      const suggested = cleanSuggestedReplacement(
        stripHiddenTtsHints(replacement.suggested)
      );
      const occurrence = await this.findUniqueTextOccurrenceForPreview(
        nextContent,
        original
      );

      if (occurrence.error || !occurrence.match) {
        this.setError(occurrence.error);
        this.statusEl?.setText("Status: Preview failed");
        return;
      }

      nextContent = replaceSelectedOccurrence(
        nextContent,
        occurrence.match.original,
        suggested,
        occurrence.match.occurrenceIndex
      );
    }

    if (nextContent === note.content) {
      this.setError("Semantic edit did not change the note.");
      this.statusEl?.setText("Status: Preview failed");
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length}`,
      role: "user",
      content: commandText,
      createdAt: Date.now()
    };
    const assistantMessage: ChatMessage = {
      id: `${Date.now()}-${this.messages.length + 1}`,
      role: "assistant",
      content: nextContent,
      createdAt: Date.now(),
      diffPreview: buildTextReplacementDiffPreview({
        title: "Voice multi-replacement preview",
        sourcePath: note.file.path,
        originalOccurrenceIndex: 0,
        original: note.content,
        suggested: nextContent,
        operationType: "voice-replace-multiple",
        userPrompt: commandText
      })
    };

    this.setError(null);
    this.messages.push(userMessage, assistantMessage);
    this.statusEl?.setText("Status: Preview ready");
    void this.showInlineDiffForMessage(assistantMessage.id);
    void this.renderMessages();
    this.queueAutoApplyDiffPreview(assistantMessage.id);
  }

  private async answerFromLastFoundFile(commandText: string): Promise<void> {
    const context = await this.readLastFoundFileContext();

    if (!context) {
      this.setError("No remembered vault search result yet. Say: find notes about ...");
      this.statusEl?.setText("Status: No remembered file");
      return;
    }

    await this.sendMessage(
      commandText,
      {
        currentNote: context
      },
      false
    );
  }

  private async openLastFoundFile(commandText?: string): Promise<void> {
    const mentionedPath = this.findLastMentionedMarkdownPaths()[0];
    const path =
      mentionedPath ??
      this.voiceSessionMemory.lastOpenedFile ??
      this.voiceSessionMemory.lastFoundFiles[0]?.path;

    if (!path) {
      this.setError("No remembered vault search result yet.");
      this.statusEl?.setText("Status: No remembered file");
      return;
    }

    await this.openVaultPath(path, `Opened remembered file: ${path}`);

    if (commandText) {
      this.appendActionReceipt(
        {
          status: "opened",
          label: "Opened remembered note",
          detail: path,
          path
        },
        commandText
      );
      return;
    }

    if (commandText) {
      this.appendLocalChatExchange(
        commandText,
        [
          "Переадресовал:",
          `- File: \`${path}\``,
          `- Folder: \`${getFolderPath(path) || "/"}\``,
          "- Source: `last mentioned note`"
        ].join("\n")
      );
    }
  }

  private async openFileByVaultQuery(
    query: string,
    commandText: string
  ): Promise<string | null> {
    this.pushActionTimeline("opening", "Opening note", query);
    let results: VaultSearchResult[] = [];
    const directFile = this.resolveOpenFileCandidate(query);

    if (directFile) {
      results = [
        {
          path: directFile.path,
          title: directFile.basename,
          score: 999,
          snippet: "Matched by file name and folder.",
          matches: ["filename", "path"]
        }
      ];
    }

    if (!results.length) {
      const rustResolved = await resolvePathsWithRustCore({
        query,
        paths: this.app.vault.getMarkdownFiles().map((file) => file.path),
        limit: 3,
        pluginDir: __dirname
      });
      results = rustResolved?.length
        ? rustResolved.map((result) => ({
            path: result.path,
            title: result.path.split("/").pop()?.replace(/\.md$/i, "") ?? result.path,
            score: result.score,
            snippet: "Matched by Rust path resolver.",
            matches: ["rust-core", "path"]
          }))
        : [];
    }

    if (!results.length) {
      this.setError(`Could not find a Markdown note for: ${query}`);
      this.statusEl?.setText("Status: Open failed");
      this.pushActionTimeline("failed", "Open failed", query);
      return null;
    }

    this.rememberVaultSearch(query, results);
    await this.openVaultPath(results[0].path, `Opened file: ${results[0].path}`);
    this.appendActionReceipt(
      {
        status: "opened",
        label: "Opened note",
        detail: `File: ${results[0].path} | folder: ${getFolderPath(results[0].path) || "/"} | query: ${query}`,
        path: results[0].path
      },
      commandText
    );
    this.pushActionTimeline("done", "Opened note", results[0].path, results[0].path);
    return results[0].path;
  }

  private resolveOpenFileCandidate(query: string): TFile | null {
    const ranked = rankOpenFilePathCandidates(
      this.app.vault.getMarkdownFiles().map((file) => file.path),
      query
    );
    const topPath = ranked[0]?.path;

    if (!topPath) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(topPath);
    return file instanceof TFile ? file : null;
  }

  private async openVaultPath(
    path: string,
    contextDetail: string,
    heading?: string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) {
      this.setError(`Could not find file: ${path}`);
      this.statusEl?.setText("Status: Open failed");
      return;
    }

    if (heading) {
      try {
        await this.app.workspace.openLinkText(`${path}#${heading}`, "", false, {
          active: true
        });
      } catch {
        await this.openVaultFile(file);
      }
    } else {
      await this.openVaultFile(file);
    }

    this.voiceSessionMemory.lastOpenedFile = path;
    this.voiceSessionMemory.activeFolder = getFolderPath(path);
    this.voiceSessionMemory.updatedAt = Date.now();
    this.setContextDetail(contextDetail, false);
    this.statusEl?.setText("Status: Opened file");
  }

  private async openVaultFile(file: TFile): Promise<void> {
    const activeMarkdownView =
      this.app.workspace.getActiveViewOfType(MarkdownView);
    const leaf =
      activeMarkdownView?.leaf ??
      this.app.workspace.getLeavesOfType("markdown")[0] ??
      this.app.workspace.getLeaf("tab");

    await leaf.openFile(file, {
      active: true
    });
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf as WorkspaceLeaf, {
      focus: true
    });
  }

  private attachLastFoundFiles(): void {
    const results = this.voiceSessionMemory.lastFoundFiles;

    if (!results.length) {
      this.setError("No remembered vault search results yet.");
      this.statusEl?.setText("Status: No remembered files");
      return;
    }

    this.attachVaultResults(results);
    this.statusEl?.setText("Status: Search context attached");
    this.appendActionReceipt({
      status: "done",
      label: "Attached search context",
      detail: `${results.length} source${results.length === 1 ? "" : "s"}`
    });
  }

  private async readLastFoundFileContext(): Promise<CurrentNoteContext | null> {
    const path =
      this.voiceSessionMemory.lastOpenedFile ??
      this.voiceSessionMemory.lastFoundFiles[0]?.path;

    if (!path) {
      return null;
    }

    return this.readMarkdownFileContext(path);
  }

  private async readMarkdownFileContext(
    path: string
  ): Promise<CurrentNoteContext | null> {
    const abstractFile = this.app.vault.getAbstractFileByPath(path);

    if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md") {
      return null;
    }

    const content = await this.app.vault.cachedRead(abstractFile);
    const includedContent = content.slice(0, MAX_NOTE_ACTION_CONTEXT_CHARS);

    this.voiceSessionMemory.lastOpenedFile = abstractFile.path;
    this.voiceSessionMemory.activeFolder = getFolderPath(abstractFile.path);
    this.voiceSessionMemory.updatedAt = Date.now();

    return {
      path: abstractFile.path,
      name: abstractFile.basename,
      content: includedContent,
      isTruncated: content.length > MAX_NOTE_ACTION_CONTEXT_CHARS,
      originalLength: content.length,
      includedLength: includedContent.length
    };
  }

  private appendTranscribedText(text: string): void {
    const trimmedText = this.getBestTranscribedText(text, {
      includeLiveBase: false
    });

    if (!trimmedText || !this.inputEl) {
      return;
    }

    const currentValue = this.liveTranscriptBaseText || this.inputEl.value.trim();
    const finalText = shouldUseFinalTranscription(
      trimmedText,
      this.liveTranscriptLastPreview
    )
      ? trimmedText
      : trimmedText;
    this.inputEl.value = currentValue
      ? `${currentValue} ${finalText}`
      : finalText;
    this.inputEl.focus();
    this.refreshLiveDialogueSurface();
  }

  private async sendTranscribedText(
    text: string,
    options?: { liveDialogue?: boolean }
  ): Promise<void> {
    const trimmedText = this.getBestTranscribedText(text, {
      includeLiveBase: true
    });

    if (!trimmedText || !this.inputEl) {
      return;
    }

    if (options?.liveDialogue && isLiveStopOnlyCommand(trimmedText)) {
      this.inputEl.value = "";
      this.statusEl?.setText("Status: Live Dialogue interrupted");
      this.setContextDetail("Live interruption: stopped", false);
      this.clearLiveTranscriptPreviewState();
      await this.startLiveDialogueListening();
      return;
    }

    this.inputEl.value = shouldUseFinalTranscription(
      trimmedText,
      this.liveTranscriptLastPreview
    )
      ? trimmedText
      : trimmedText;
    await this.sendUserMessage(options);
  }

  private getBestTranscribedText(
    finalTranscription: string,
    options: { includeLiveBase: boolean }
  ): string {
    return resolveBestTranscribedText({
      finalTranscription,
      liveTranscriptBaseText: this.liveTranscriptBaseText,
      liveTranscriptLastPreview: this.liveTranscriptLastPreview,
      includeLiveBase: options.includeLiveBase
    });
  }

  private updateMicButton(): void {
    if (!this.micButtonEl) {
      return;
    }

    this.micButtonEl.empty();
    setIcon(this.micButtonEl, this.isRecording ? "square" : "mic");
    this.micButtonEl.toggleClass("is-recording", this.isRecording);
    this.micButtonEl.removeAttribute("title");
    this.micButtonEl.setAttribute(
      "aria-label",
      this.isRecording ? this.t("stopRecording") : this.t("recordVoice")
    );
    this.updateLiveDialogueButton();
    this.updateSendButton();
  }

  private updateLiveDialogueButton(): void {
    if (!this.liveDialogueButtonEl) {
      return;
    }

    this.liveDialogueButtonEl.empty();
    this.createMindoLogoImage(
      this.liveDialogueButtonEl,
      "contex-agent__live-dialogue-logo"
    );
    this.liveDialogueButtonEl.toggleClass(
      "is-live-dialogue-active",
      this.isLiveDialogueSessionActive
    );
    this.liveDialogueButtonEl.removeAttribute("title");
    this.liveDialogueButtonEl.setAttribute(
      "aria-label",
      this.isLiveDialogueSessionActive
        ? this.isRecording
          ? this.t("sendLiveDialogueTurn")
          : this.t("stopLiveDialogue")
        : this.t("startLiveDialogue")
    );
    this.refreshLiveDialogueSurface();
  }

  private refreshLiveDialogueSurface(): void {
    if (
      !this.rootEl ||
      !this.liveDialogueSurfaceEl ||
      !this.liveDialogueTranscriptEl
    ) {
      return;
    }

    const state = getLiveDialogueSurfaceState({
      isSessionActive: this.isLiveDialogueSessionActive,
      isRecording: this.isRecording,
      isLoading: this.isLoading,
      isTranscribing: this.isTranscribingVoice,
      isSpeaking: Boolean(this.speakingMessageId),
      latestUserText: getLiveDialogueLatestUserText({
        messages: this.messages,
        liveInput: this.inputEl?.value ?? "",
        isRecording: this.isRecording
      }),
      latestAssistantText: getLiveDialogueLatestAssistantText({
        messages: this.messages,
        streamingMessageId: this.streamingMessageId
      }),
      messages: this.messages,
      liveInput: this.inputEl?.value ?? "",
      streamingMessageId: this.streamingMessageId
    });
    const rootClasses = [
      "is-live-dialogue-surface-active",
      "is-live-dialogue-idle",
      "is-live-dialogue-listening",
      "is-live-dialogue-thinking",
      "is-live-dialogue-speaking",
      "is-live-dialogue-transcribing"
    ];

    rootClasses.forEach((className) => this.rootEl?.removeClass(className));
    state.rootClass
      .split(" ")
      .filter(Boolean)
      .forEach((className) => this.rootEl?.addClass(className));

    this.liveDialogueSurfaceEl.toggleClass(
      "is-visible",
      state.showVoiceSurface
    );
    this.liveDialogueSurfaceEl.setAttribute(
      "aria-hidden",
      state.showVoiceSurface ? "false" : "true"
    );

    this.liveDialoguePhaseEl?.setText(getLiveDialoguePhaseLabel(state.phase));
    this.refreshLiveDialogueOrb(state.phase, state.showVoiceSurface);
    void this.renderLiveDialogueTranscript(state);
  }

  private refreshLiveDialogueOrb(
    phase: LiveDialoguePhase,
    isVisible: boolean
  ): void {
    if (!this.liveDialogueOrbEl) {
      return;
    }

    const phaseClasses = [
      "is-idle",
      "is-listening",
      "is-thinking",
      "is-speaking",
      "is-transcribing"
    ];
    phaseClasses.forEach((className) => {
      this.liveDialogueOrbEl?.removeClass(className);
    });

    this.liveDialogueOrbEl.toggleClass("is-active", isVisible);
    this.liveDialogueOrbEl.addClass(`is-${phase}`);
    this.liveDialogueOrbEl.removeAttribute("title");
    this.liveDialogueOrbEl.setAttribute(
      "aria-label",
      getLiveDialogueOrbTitle({
        phase,
        isSessionActive: this.isLiveDialogueSessionActive,
        startLabel: this.t("startLiveDialogue"),
        stopLabel: this.t("stopLiveDialogue")
      })
    );

    if (!isVisible) {
      this.liveDialogueOrbEl.style.removeProperty("--contex-live-scale");
      this.liveDialogueOrbEl.style.removeProperty("--contex-live-glow");
    }
  }

  private async renderLiveDialogueTranscript(
    state: ReturnType<typeof getLiveDialogueSurfaceState>
  ): Promise<void> {
    if (!this.liveDialogueTranscriptEl) {
      return;
    }

    const renderSequence = ++this.liveDialogueTranscriptRenderSequence;
    const sourcePath = getCurrentNoteLabel(this.app) ?? "";

    this.liveDialogueTranscriptEl.empty();

    const transcript = this.getLiveDialogueDisplayTranscript(state);

    for (const item of transcript) {
      if (renderSequence !== this.liveDialogueTranscriptRenderSequence) {
        return;
      }

      const itemEl = this.liveDialogueTranscriptEl?.createDiv({
        cls: [
          "contex-agent__live-transcript-item",
          `contex-agent__live-transcript-item--${item.role}`,
          `contex-agent__live-transcript-item--${item.variant}`
        ]
      });

      if (!itemEl) {
        continue;
      }

      if (item.role === "assistant") {
        const avatarEl = itemEl.createSpan({
          cls: "contex-agent__live-transcript-avatar"
        });
        this.createMindoLogoImage(
          avatarEl,
          "contex-agent__live-transcript-avatar-logo"
        );
      }

      const bubbleEl = itemEl.createDiv({
        cls: "contex-agent__live-transcript-bubble"
      });
      bubbleEl.createDiv({
        cls: "contex-agent__live-transcript-role",
        text: item.role === "assistant" ? "Mindo" : "You"
      });
      const textEl = bubbleEl.createDiv({
        cls: "contex-agent__live-transcript-text"
      });

      if (item.role === "assistant" && item.text.trim()) {
        textEl.addClass("markdown-rendered");
        await MarkdownRenderer.render(
          this.app,
          stripHiddenTtsHints(item.text),
          textEl,
          sourcePath,
          this
        );
      } else {
        textEl.setText(item.text);
      }

      if (renderSequence !== this.liveDialogueTranscriptRenderSequence) {
        return;
      }
    }

    if (renderSequence === this.liveDialogueTranscriptRenderSequence) {
      this.liveDialogueTranscriptEl.scrollTop =
        this.liveDialogueTranscriptEl.scrollHeight;
    }
  }

  private getLiveDialogueDisplayTranscript(
    state: ReturnType<typeof getLiveDialogueSurfaceState>
  ): LiveDialogueTranscriptItem[] {
    if (state.transcript.length) {
      return state.transcript;
    }

    return [
      {
        role: "assistant",
        text: getLiveDialogueFallbackText(state.phase),
        variant: "status"
      }
    ];
  }

  private canSpeakMessage(message: ChatMessage): boolean {
    return Boolean(
      message.role === "assistant" &&
        message.content.trim() &&
        !message.diffPreview &&
        !message.vaultSearchResults
    );
  }

  private async warmLiveDialogueAcknowledgements(): Promise<void> {
    if (
      this.plugin.settings.ttsProvider === "disabled" ||
      this.plugin.settings.ttsProvider === "browser"
    ) {
      return;
    }

    await Promise.allSettled(
      (["thinking", "opening", "editing", "researching"] as const).map((kind) =>
        this.getLiveDialogueAcknowledgementAudio(kind)
      )
    );
  }

  private async getLiveDialogueAcknowledgementAudio(
    kind: LiveDialogueAcknowledgementKind
  ): Promise<Blob> {
    const cached = this.liveAcknowledgementAudioCache.get(kind);

    if (cached) {
      return cached;
    }

    const audio = await this.requestRemoteSpeechAudio(
      buildLiveDialogueAcknowledgement(kind)
    );
    this.liveAcknowledgementAudioCache.set(kind, audio);

    return audio;
  }

  private async playLiveDialogueAcknowledgement(
    kind: LiveDialogueAcknowledgementKind
  ): Promise<void> {
    if (
      !this.isLiveDialogueSessionActive ||
      this.plugin.settings.ttsProvider === "disabled" ||
      this.plugin.settings.ttsProvider === "browser"
    ) {
      return;
    }

    const cachedAudio = this.liveAcknowledgementAudioCache.get(kind);

    if (!cachedAudio) {
      return;
    }

    this.stopLiveDialogueAcknowledgement();

    const audioUrl = URL.createObjectURL(cachedAudio);
    const audio = new Audio(audioUrl);
    this.liveAcknowledgementSpeechText = buildLiveDialogueAcknowledgement(kind);
    this.liveAcknowledgementAudio = audio;
    this.liveAcknowledgementAudioUrl = audioUrl;

    const cleanup = () => {
      if (this.liveAcknowledgementAudio === audio) {
        this.stopLiveDialogueAcknowledgement();
      }
    };

    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);
    await audio.play();
  }

  private stopLiveDialogueAcknowledgement(): void {
    if (this.liveAcknowledgementAudio) {
      this.liveAcknowledgementAudio.pause();
      this.liveAcknowledgementAudio = null;
    }

    this.liveAcknowledgementSpeechText = "";

    if (this.liveAcknowledgementAudioUrl) {
      URL.revokeObjectURL(this.liveAcknowledgementAudioUrl);
      this.liveAcknowledgementAudioUrl = null;
    }
  }

  private createLiveStreamingSpeechQueue(
    messageId: string
  ): StreamingSpeechQueue | null {
    if (
      this.plugin.settings.ttsProvider === "disabled" ||
      this.plugin.settings.ttsProvider === "browser"
    ) {
      return null;
    }

    this.stopSpeaking();
    this.speakingMessageId = messageId;
    this.statusEl?.setText("Status: Thinking");
    void this.renderMessages();

    const queue = new StreamingSpeechQueue({
      firstChunkWords: 8,
      nextChunkWords: 14,
      maxChunkChars: 220,
      prepareText: (text) => getSpeechText(text, "full"),
      synthesize: (text) => this.requestRemoteSpeechAudio(text),
      onChunkStart: () => {
        if (this.speakingMessageId === messageId) {
          this.stopLiveDialogueAcknowledgement();
          this.statusEl?.setText("Status: Speaking");
        }
      },
      onError: (error) => {
        if (this.speakingMessageId !== messageId) {
          return;
        }

        console.warn("[Mindo Streaming TTS]", error);
        this.setError(this.getErrorMessage(error));
        this.statusEl?.setText("Status: TTS failed");
      }
    });

    this.liveSpeechQueue = queue;
    this.syncLiveBargeInMonitor();
    return queue;
  }

  private async requestRemoteSpeechAudio(text: string): Promise<Blob> {
    const speechText = text.trim();

    if (!speechText) {
      throw new Error("TTS chunk is empty.");
    }

    if (
      this.plugin.settings.ttsProvider === "silero" &&
      !this.plugin.settings.sileroVoice.trim().startsWith("en_") &&
      isMostlyEnglishSpeech(speechText)
    ) {
      return this.plugin.requestLocalKokoroSpeechAudio(speechText);
    }

    if (this.plugin.settings.ttsProvider === "silero") {
      return this.plugin.requestLocalSileroSpeechAudio(
        prepareSileroSpeechText(
          speechText,
          this.plugin.settings.sileroPronunciationDictionary
        )
      );
    }

    if (this.plugin.settings.ttsProvider === "kokoro") {
      return this.plugin.requestLocalKokoroSpeechAudio(speechText);
    }

    throw new Error("Remote TTS provider is not configured.");
  }

  private async toggleSpeakMessage(message: ChatMessage): Promise<void> {
    if (this.speakingMessageId === message.id) {
      this.stopSpeaking();
      void this.renderMessages();
      return;
    }

    await this.speakMessage(message);
  }

  private async speakLatestAssistantMessage(): Promise<void> {
    const target = await this.findLatestSpeechTarget();

    if (!target) {
      this.setError("No readable assistant answer yet.");
      this.statusEl?.setText("Status: Nothing to read");
      return;
    }

    const started = await this.speakMessage({
      id: target.id,
      role: "assistant",
      content: target.content,
      createdAt: Date.now()
    });

    if (started) {
      this.appendWorkflowReceipt({
        status: "done",
        label: "Reading latest answer",
        detail: trimTextForContext(target.content, 80)
      });
    }
  }

  private async findLatestSpeechTarget(): Promise<{
    id: string;
    content: string;
  } | null> {
    const latestAnswer = findLatestAssistantSpeechMessage(
      this.messages.filter(
        (message) =>
          message.actionReceipt?.label !== "Reading latest answer" &&
          !message.actionReceipt &&
          !message.vaultSearchResults
      )
    );

    if (latestAnswer) {
      return {
        id: latestAnswer.id,
        content: latestAnswer.content
      };
    }

    for (const message of [...this.messages].reverse()) {
      if (message.role !== "assistant") {
        continue;
      }

      if (message.actionReceipt?.label === "Reading latest answer") {
        continue;
      }

      if (message.diffPreview?.suggested.trim()) {
        return {
          id: `${message.id}-diff-speech`,
          content: message.diffPreview.suggested
        };
      }

      if (message.actionReceipt?.path) {
        const context = await this.readMarkdownFileContext(
          message.actionReceipt.path
        );

        if (context?.content.trim()) {
          return {
            id: `${message.id}-file-speech`,
            content: context.content
          };
        }
      }

      if (message.content.trim() && !message.vaultSearchResults) {
        return {
          id: message.id,
          content: message.content
        };
      }
    }

    return null;
  }

  private async speakMessage(message: ChatMessage): Promise<boolean> {
    if (this.plugin.settings.ttsProvider === "disabled") {
      new Notice("TTS provider is disabled.");
      this.setError("TTS provider is disabled.");
      this.statusEl?.setText("Status: TTS disabled");
      return false;
    }

    const text = getSpeechText(
      message.content,
      this.plugin.settings.ttsReadMode
    );

    if (!text) {
      new Notice("There is no readable assistant text.");
      this.setError("There is no readable assistant text.");
      this.statusEl?.setText("Status: Nothing to read");
      return false;
    }

    this.stopSpeaking();
    this.speakingMessageId = message.id;
    this.statusEl?.setText("Status: Reading answer");
    this.syncLiveBargeInMonitor();
    void this.renderMessages();

    try {
      if (this.plugin.settings.ttsProvider === "browser") {
        this.speakWithBrowser(text, message.id);
        return true;
      }

      await this.speakWithRemoteProvider(text, message.id);
      return true;
    } catch (error) {
      this.stopSpeaking();
      this.setError(this.getErrorMessage(error));
      this.statusEl?.setText("Status: TTS failed");
      void this.renderMessages();
      return false;
    }
  }

  private async speakMessageAndWait(message: ChatMessage): Promise<boolean> {
    const started = await this.speakMessage(message);

    if (!started) {
      return false;
    }

    if (this.speakingMessageId !== message.id) {
      return true;
    }

    return new Promise((resolve) => {
      this.speechCompletionResolvers.set(message.id, resolve);
    });
  }

  private speakWithBrowser(text: string, messageId: string): void {
    if (!window.speechSynthesis) {
      throw new Error("Browser speech synthesis is not available.");
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const language = guessSpeechLanguage(text);
    const voice = findSpeechVoice(language);
    utterance.lang = language;

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => this.finishSpeaking(messageId);
    utterance.onerror = () => this.finishSpeaking(messageId);
    this.speechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private async speakWithRemoteProvider(
    text: string,
    messageId: string
  ): Promise<void> {
    let audioBlob: Blob;

    if (
      this.plugin.settings.ttsProvider === "silero" &&
      !this.plugin.settings.sileroVoice.trim().startsWith("en_") &&
      isMostlyEnglishSpeech(text)
    ) {
      this.statusEl?.setText("Status: Reading English with Kokoro");

      try {
        audioBlob = await this.plugin.requestLocalKokoroSpeechAudio(text);
      } catch (error) {
        if (this.speakingMessageId !== messageId) {
          return;
        }

        console.warn("[Mindo TTS]", this.getErrorMessage(error));

        if (this.plugin.settings.fallbackToBrowserTts) {
          new Notice(
            "Kokoro English TTS is unavailable. Falling back to Browser TTS."
          );
          this.setError(null);
          this.statusEl?.setText("Status: Reading with Browser TTS");
          this.speakWithBrowser(text, messageId);
          return;
        }

        this.stopSpeaking();
        this.setError(this.getErrorMessage(error));
        this.statusEl?.setText("Status: Kokoro unavailable");
        void this.renderMessages();
        return;
      }

      this.playSpeechAudio(audioBlob, messageId);
      return;
    }

    if (this.plugin.settings.ttsProvider === "silero") {
      this.statusEl?.setText("Status: Reading with Silero");

      try {
        audioBlob = await this.plugin.requestLocalSileroSpeechAudio(
          prepareSileroSpeechText(
            text,
            this.plugin.settings.sileroPronunciationDictionary
          )
        );
      } catch (error) {
        if (this.speakingMessageId !== messageId) {
          return;
        }

        console.warn("[Mindo TTS]", this.getErrorMessage(error));

        if (this.plugin.settings.fallbackToBrowserTts) {
          new Notice(
            "Silero TTS is unavailable. Falling back to Browser TTS."
          );
          this.setError(null);
          this.statusEl?.setText("Status: Reading with Browser TTS");
          this.speakWithBrowser(text, messageId);
          return;
        }

        this.stopSpeaking();
        this.setError(this.getErrorMessage(error));
        this.statusEl?.setText("Status: Silero unavailable");
        void this.renderMessages();
        return;
      }

      this.playSpeechAudio(audioBlob, messageId);
      return;
    }

    if (this.plugin.settings.ttsProvider === "kokoro") {
      this.statusEl?.setText("Status: Reading with Kokoro");

      try {
        audioBlob = await this.plugin.requestLocalKokoroSpeechAudio(text);
      } catch (error) {
        if (this.speakingMessageId !== messageId) {
          return;
        }

        console.warn("[Mindo TTS]", this.getErrorMessage(error));

        if (this.plugin.settings.fallbackToBrowserTts) {
          new Notice(
            "Kokoro English TTS is unavailable. Falling back to Browser TTS."
          );
          this.setError(null);
          this.statusEl?.setText("Status: Reading with Browser TTS");
          this.speakWithBrowser(text, messageId);
          return;
        }

        this.stopSpeaking();
        this.setError(this.getErrorMessage(error));
        this.statusEl?.setText("Status: Kokoro unavailable");
        void this.renderMessages();
        return;
      }

      if (this.speakingMessageId !== messageId) {
        return;
      }

      this.playSpeechAudio(audioBlob, messageId);
    }

  }

  private playSpeechAudio(audioBlob: Blob, messageId: string): void {
    if (this.speakingMessageId !== messageId) {
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    this.activeAudio = audio;
    this.activeAudioUrl = audioUrl;
    audio.addEventListener("ended", () => this.finishSpeaking(messageId));
    audio.addEventListener("error", () => this.finishSpeaking(messageId));
    void audio.play();
  }

  private stopSpeaking(): void {
    const stoppedMessageId = this.speakingMessageId;
    this.stopLiveDialogueAcknowledgement();

    if (this.liveSpeechQueue) {
      this.liveSpeechQueue.cancel();
      this.liveSpeechQueue = null;
    }

    if (this.speechUtterance) {
      window.speechSynthesis?.cancel();
      this.speechUtterance = null;
    }

    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio = null;
    }

    if (this.activeAudioUrl) {
      URL.revokeObjectURL(this.activeAudioUrl);
      this.activeAudioUrl = null;
    }

    this.speakingMessageId = null;
    this.statusEl?.setText("Status: Ready");

    if (stoppedMessageId) {
      this.resolveSpeechCompletion(stoppedMessageId, false);
    }
    this.refreshLiveDialogueSurface();
    this.syncLiveBargeInMonitor();
  }

  private finishSpeaking(messageId: string): void {
    if (this.speakingMessageId !== messageId) {
      return;
    }

    if (this.activeAudioUrl) {
      URL.revokeObjectURL(this.activeAudioUrl);
    }

    this.activeAudio = null;
    this.activeAudioUrl = null;
    this.liveSpeechQueue = null;
    this.speechUtterance = null;
    this.speakingMessageId = null;
    this.statusEl?.setText("Status: Ready");
    this.resolveSpeechCompletion(messageId, true);
    this.refreshLiveDialogueSurface();
    this.syncLiveBargeInMonitor();
    void this.renderMessages();
  }

  private resolveSpeechCompletion(messageId: string, completed: boolean): void {
    const resolver = this.speechCompletionResolvers.get(messageId);

    if (!resolver) {
      return;
    }

    this.speechCompletionResolvers.delete(messageId);
    resolver(completed);
  }

  private removeEmptyAssistantMessages(): void {
    this.messages = this.messages.filter(
      (message) => message.role !== "assistant" || message.content.trim()
    );
  }

  private pushActionTimeline(
    type: ActionTimelineEventType,
    label: string,
    detail?: string,
    path?: string
  ): void {
    this.actionTimeline.push({
      type,
      label,
      detail,
      path
    });
  }

  private setLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
    this.pushActionTimeline(
      isLoading ? "thinking" : "done",
      isLoading ? "Assistant is thinking" : "Assistant is ready"
    );

    if (this.inputEl) {
      this.inputEl.disabled = isLoading;
    }

    if (this.useCurrentNoteEl) {
      this.useCurrentNoteEl.disabled = isLoading;
    }

    if (this.useVaultSearchEl) {
      this.useVaultSearchEl.disabled = isLoading;
    }

    if (this.micButtonEl) {
      this.micButtonEl.disabled =
        (isLoading && !this.isRecording) || this.isTranscribingVoice;
    }

    if (this.liveDialogueButtonEl) {
      this.liveDialogueButtonEl.disabled = this.isTranscribingVoice;
    }

    this.updateSendButton();

    this.noteActionButtons.forEach((button) => {
      button.disabled = isLoading;
    });
    this.selectionToolbarButtons.forEach((button) => {
      button.disabled = isLoading;
    });

    if (isLoading) {
      this.hideSelectionToolbar();
    }

    if (isLoading) {
      this.statusEl?.setText("Status: Waiting for LLM");
    }
    this.refreshLiveDialogueSurface();
    this.syncLiveBargeInMonitor();
  }

  private updateSendButton(): void {
    if (!this.sendButtonEl) {
      return;
    }

    this.sendButtonEl.empty();
    this.sendButtonEl.toggleClass(
      "is-loading",
      this.isLoading || this.isTranscribingVoice
    );
    this.sendButtonEl.disabled = this.isTranscribingVoice;

    if (this.isTranscribingVoice) {
      this.renderThinkingDots(this.sendButtonEl);
      this.sendButtonEl.setAttribute("aria-label", "Transcribing voice");
      return;
    }

    if (this.isLoading && !this.isRecording) {
      this.renderThinkingDots(this.sendButtonEl);
      this.sendButtonEl.setAttribute("aria-label", "Cancel response");
      return;
    }

    setIcon(this.sendButtonEl, "arrow-up");
    this.sendButtonEl.setAttribute(
      "aria-label",
      this.isRecording ? "Send voice message" : "Send"
    );
  }

  private renderThinkingDots(parentEl: HTMLElement): void {
    const dotsEl = parentEl.createSpan({
      cls: "contex-agent__thinking-dots"
    });

    for (let index = 0; index < 3; index += 1) {
      dotsEl.createSpan({
        cls: "contex-agent__thinking-dot"
      });
    }
  }

  private cancelCurrentGeneration(
    options: { restorePendingUser?: boolean } = {}
  ): void {
    if (!this.isLoading && !this.activeGenerationAbortController) {
      return;
    }

    const restorePendingUser = options.restorePendingUser ?? true;
    this.activeGenerationAbortController?.abort();
    this.activeGenerationAbortController = null;
    this.stopSpeaking();

    if (this.streamingMessageId) {
      this.removeMessageById(this.streamingMessageId);
      this.streamingMessageId = null;
    }

    if (restorePendingUser && this.pendingUserMessageId) {
      this.removeMessageById(this.pendingUserMessageId);

      if (this.inputEl && this.pendingUserPrompt) {
        this.inputEl.disabled = false;
        this.inputEl.value = this.pendingUserPrompt;
        this.inputEl.focus();
      }
    }

    this.pendingUserMessageId = null;
    this.pendingUserPrompt = null;
    this.setError(null);
    this.statusEl?.setText("Status: Canceled");
    this.setLoading(false);
    void this.renderMessages();
  }

  private removeMessageById(messageId: string): void {
    this.messages = this.messages.filter((message) => message.id !== messageId);
  }

  private setError(message: string | null): void {
    if (!this.errorEl) {
      return;
    }

    this.errorEl.setText(message ?? "");
    this.errorEl.style.display = message ? "block" : "none";
  }

  private async readCurrentNoteContextForRequest(): Promise<{
    context: CurrentNoteContext | null;
  }> {
    const result = await getCurrentNoteContext(this.app);

    if (result.context?.isTruncated) {
      this.setContextDetail(
        `Current note context: first ${result.context.includedLength} of ${result.context.originalLength} characters attached for speed.`,
        false
      );
    } else if (result.warning) {
      this.setContextDetail(result.warning, true);
    } else if (result.context) {
      this.setContextDetail(`${this.t("activeNote")}: ${result.context.path}`, false);
    }

    return {
      context: result.context
    };
  }

  private readSelectedTextContextForRequest(): {
    context: SelectedTextContext | null;
    warning: string | null;
  } {
    const result = getSelectedTextContext(this.app);

    if (result.warning) {
      this.setContextDetail(result.warning, true);
    } else if (result.context) {
      this.setContextDetail(
        `Selected text: ${result.context.includedLength} characters from ${result.context.path}`,
        false
      );
    }

    return result;
  }

  private readSelectedTextContextForVoice(): {
    context: SelectedTextContext | null;
    warning: string | null;
  } {
    const result = this.readSelectedTextContextForRequest();

    if (this.diffController.hasUsableSelection(result.context)) {
      this.lastSelectedTextContext = result.context;
      this.lastSelectedTextContextAt = Date.now();
      return result;
    }

    const activeFile = this.app.workspace.getActiveFile();
    const lastContextAge = Date.now() - this.lastSelectedTextContextAt;

    if (
      this.diffController.hasUsableSelection(this.lastSelectedTextContext) &&
      lastContextAge < 120000 &&
      (!activeFile || activeFile.path === this.lastSelectedTextContext.path)
    ) {
      this.setContextDetail(
        `Selected text: ${this.lastSelectedTextContext.includedLength} characters from ${this.lastSelectedTextContext.path}`,
        false
      );

      return {
        context: this.lastSelectedTextContext,
        warning: null
      };
    }

    return result;
  }

  private async readActiveMarkdownNote(): Promise<{
    file: TFile;
    content: string;
  } | null> {
    const file = this.app.workspace.getActiveFile();

    if (!(file instanceof TFile) || file.extension !== "md") {
      return null;
    }

    const activeMarkdownView =
      this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeMarkdownView?.file?.path === file.path) {
      return {
        file,
        content: activeMarkdownView.editor.getValue()
      };
    }

    return {
      file,
      content: await this.app.vault.cachedRead(file)
    };
  }

  private buildSelectedContextFromNote(
    file: TFile,
    content: string
  ): SelectedTextContext {
    const includedText = content.slice(0, MAX_NOTE_ACTION_CONTEXT_CHARS);
    const isTruncated = includedText.length < content.length;

    this.setContextDetail(
      isTruncated
        ? `Current note context: first ${includedText.length} of ${content.length} characters attached for speed.`
        : `${this.t("activeNote")}: ${file.path}`,
      false
    );

    return {
      path: file.path,
      name: file.basename,
      text: includedText,
      isTruncated,
      originalLength: content.length,
      includedLength: includedText.length
    };
  }

  private refreshContextStatus(): void {
    this.refreshContextMeter();

    if (this.currentNotePillTextEl) {
      this.currentNotePillTextEl.setText(
        getCurrentNoteLabel(this.app) ?? this.t("activeNote")
      );
    }

    if (!this.contextStatusEl || !this.contextDetailEl) {
      return;
    }

    this.contextStatusEl.setText(
      `Context: Current note ${this.useCurrentNote ? "ON" : "OFF"}`
    );

    if (!this.useCurrentNote) {
      this.setContextDetail(null, false);
      return;
    }

    const noteLabel = getCurrentNoteLabel(this.app);
    this.setContextDetail(
      noteLabel
        ? `${this.t("activeNote")}: ${noteLabel}`
        : this.t("noActiveNote"),
      !noteLabel
    );
  }

  private async refreshSttStatus(): Promise<void> {
    if (!this.sttStatusEl || this.isRecording) {
      return;
    }

    this.setSttStatusText("STT: checking...", "busy");

    try {
      const status = await this.plugin.getLocalSttStatus();
      const label = `STT: ${status.isRunning ? "running" : "offline"} (${status.backend}, ${status.model}, ${status.language})`;
      this.setSttStatusText(label, status.isRunning ? "ok" : "warning");
    } catch (error) {
      this.setSttStatusText(
        `STT: unknown (${this.getErrorMessage(error)})`,
        "warning"
      );
    }
  }

  private setSttStatusText(
    text: string,
    tone: "ok" | "warning" | "busy"
  ): void {
    if (!this.sttStatusEl) {
      return;
    }

    this.sttStatusEl.setText(text);
    this.sttStatusEl.removeClass("contex-agent__stt-status--ok");
    this.sttStatusEl.removeClass("contex-agent__stt-status--warning");
    this.sttStatusEl.removeClass("contex-agent__stt-status--busy");
    this.sttStatusEl.addClass(`contex-agent__stt-status--${tone}`);
  }

  private isChatNearBottom(): boolean {
    if (!this.chatEl) {
      return true;
    }

    return (
      this.chatEl.scrollHeight -
        this.chatEl.scrollTop -
        this.chatEl.clientHeight <=
      8
    );
  }

  private setContextDetail(message: string | null, isWarning: boolean): void {
    if (!this.contextDetailEl) {
      return;
    }

    this.contextDetailEl.setText(message ?? "");
    this.contextDetailEl.toggleClass(
      "contex-agent__context-detail--warning",
      isWarning
    );
    this.contextDetailEl.style.display = message ? "block" : "none";
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}


function estimateTokensFromChars(charCount: number): number {
  if (!Number.isFinite(charCount) || charCount <= 0) {
    return 0;
  }

  return Math.ceil(charCount / CONTEXT_METER_CHARS_PER_TOKEN);
}

function compactModelProfileLabel(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^models\//iu, "")
    .split(/[/:]/u)
    .filter(Boolean)
    .pop()
    ?.replace(/\b(?:latest|preview|instruct|chat|model)\b/giu, "")
    .replace(/[-_.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim() ?? "Model";
  const lower = cleaned.toLowerCase();

  if (lower.includes("haiku")) {
    return "Haiku";
  }

  if (lower.includes("sonnet")) {
    return "Sonnet";
  }

  if (lower.includes("opus")) {
    return "Opus";
  }

  if (lower.includes("llama")) {
    const version = lower.match(/llama\s*(\d+(?:\.\d+)?)/u)?.[1];
    const variant = lower.match(/\b(scout|maverick|guard)\b/u)?.[1];
    return ["Llama", version, titleCaseWord(variant)].filter(Boolean).join(" ");
  }

  if (lower.includes("deepseek")) {
    const version = lower.match(/\bv\d+\b/u)?.[0]?.toUpperCase();
    const variant = lower.match(/\b(flash|reasoner|chat|coder)\b/u)?.[1];
    return ["DeepSeek", version, titleCaseWord(variant)]
      .filter(Boolean)
      .join(" ");
  }

  if (lower.includes("gemma")) {
    const version = lower.match(/gemma\s*(\d+(?:\.\d+)?)/u)?.[1];
    const size = lower.match(/\b\d+(?:b|m)\b/u)?.[0]?.toUpperCase();
    return ["Gemma", version, size].filter(Boolean).join(" ");
  }

  const words = cleaned
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .filter((word) => !/^\d{6,}$/u.test(word))
    .slice(0, 3)
    .map(titleCaseWord);
  const label = words.join(" ").trim();

  return label || "Model";
}

function titleCaseWord(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (/^[a-z]?[\d.]+[a-z]*$/iu.test(value) || value.length <= 3) {
    return value.toUpperCase();
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function cleanSuggestedReplacement(content: string): string {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);

  return (fenceMatch?.[1] ?? trimmed).trim();
}

function isGenerationCanceledError(error: unknown): boolean {
  return getUnknownErrorMessage(error)
    .toLowerCase()
    .includes("generation canceled");
}

function getUnknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactSectionExcerpt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();

  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
}

interface MarkdownSectionExcerpt {
  heading: string;
  excerpt: string;
  score: number;
}

interface MarkdownSectionChunk {
  heading: string;
  text: string;
  index: number;
}

function extractRelevantMarkdownSections(
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

function splitMarkdownSections(content: string): MarkdownSectionChunk[] {
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

function buildSemanticSectionTerms(query: string): string[] {
  const baseTerms = tokenizeSemanticSectionQuery(query);
  const expandedTerms = new Set(baseTerms);

  baseTerms.forEach((term) => {
    const expansions = SEMANTIC_SECTION_TERM_EXPANSIONS[term] ?? [];
    expansions.forEach((expansion) => expandedTerms.add(expansion));
  });

  return Array.from(expandedTerms).filter((term) => term.length >= 2).slice(0, 36);
}

function tokenizeSemanticSectionQuery(query: string): string[] {
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

function scoreMarkdownSection(
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

function trimMarkdownSection(text: string, maxChars: number): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

const SEMANTIC_SECTION_TERM_EXPANSIONS: Record<string, string[]> = {
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

function isLocalOnlyCommandText(userRequest: string): boolean {
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

function decideAutoWebResearch(
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
  const explicitWeb =
    includesAny(normalized, [
      "в интернете",
      "в вебе",
      "web",
      "internet",
      "гугл",
      "поиск в сети",
      "online"
    ]);
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

function buildAutoWebResearchQuery(
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

function extractContextResearchTopic(
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

function formatAutoWebContextForPrompt(webContext: AutoWebContext): string {
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

function formatProjectMemoryForPrompt(projectMemory: string): string {
  return [
    "Project memory context:",
    "Use this as durable background memory for the Mindo project. Do not copy it verbatim unless relevant.",
    projectMemory
  ].join("\n");
}

function isProjectMemoryFile(path: string): boolean {
  const normalized = normalizeOpenFileValue(path);

  return (
    path.startsWith(`${PROJECT_MEMORY_FOLDER}/`) ||
    normalized.includes("contex memory") ||
    normalized.includes("project memory") ||
    normalized.includes("durable memory")
  );
}

function shouldUseWebForResearchWorkflow(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return includesAny(normalized, [
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
    "web",
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

function sanitizeResearchTitle(title: string | undefined): string | null {
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

function inferResearchNoteTitle(commandText: string): string {
  return sanitizeResearchTitle(
    inferCreateNoteTitleFromCommand(commandText, "Mindo Research Note")
  ) || "Mindo Research Note";
}

function buildContexCodePlanDraftPrompt(options: {
  path: string;
  markdown: string;
}): string {
  return [
    "Analyze the active Obsidian project note and create a practical coding plan for Mindo Code.",
    "Return JSON only. Do not include Markdown fences or prose.",
    "The plan must be derived from the note content, not from the file name alone.",
    "Prefer a short product/project title from the first H1 or the central idea.",
    "Create 3-6 phases and 2-5 concrete engineering tasks per phase.",
    "Each task should be actionable for a coding agent and include acceptance checks.",
    "Use this JSON shape:",
    JSON.stringify(
      {
        title: "Project Name",
        phases: [
          {
            title: "MVP Foundation",
            summary: "What this phase delivers.",
            tasks: [
              {
                title: "Implement core contract",
                summary: "What to change and why.",
                acceptance: [
                  "Behavior is implemented.",
                  "Tests or manual verification pass."
                ],
                files: ["src/example.ts"],
                commands: ["npm run test", "npm run build"]
              }
            ]
          }
        ]
      },
      null,
      2
    ),
    "",
    "Active note path:",
    options.path,
    "",
    "Active note markdown:",
    options.markdown.slice(0, 24000)
  ].join("\n");
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function normalizeNoisyLocalCommandText(text: string): string {
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
    .replace(/\b\u043e\u0442\u043a\u0440\u043e\u044e\b/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/\b\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0439\b/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/\b\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c\b/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/\b\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u044e\b/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/\b\u043e\u0442\u043a\u0440\u044b\u043b[ao\u0430\u043e]?\b/giu, "\u043e\u0442\u043a\u0440\u043e\u0439")
    .replace(/\b\u0432\u0430\u043f\u043a[аииеу]?\b/giu, "\u0432 \u043f\u0430\u043f\u043a\u0435")
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

function getEffectiveLocalCommandText(commandText: string): string {
  const correctedSegment = extractCorrectedCommandSegment(commandText);

  return correctedSegment
    ? normalizeNoisyLocalCommandText(correctedSegment)
    : commandText;
}

function extractCorrectedCommandSegment(commandText: string): string | null {
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

function hasLocalCommandActionMarker(text: string): boolean {
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

function extractVoiceTextReplacement(
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

function extractVoiceReplacement(commandText: string): string | null {
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

function cleanVoiceReplacementText(text: string): string {
  return text
    .trim()
    .replace(/^(?:вот\s+это|это|следующее|так)\s*[:\-–—]?\s*/i, "")
    .replace(/^["'«“]+|["'»”]+$/g, "")
    .trim();
}

function cleanVoiceSearchQuery(text: string): string {
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

function extractVoiceRefineInstruction(commandText: string): string | null {
  const match = commandText.match(
    /^(?:поменяй|измени|исправь|добавь|убери|сделай)\s+(?:еще|ещё|это|вариант|предложение)?\s*([\s\S]*)$/i
  );
  const instruction = match?.[1]?.trim() ?? "";

  return instruction || null;
}

function isVoiceAcceptCommand(commandText: string): boolean {
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

function isVoiceRejectCommand(commandText: string): boolean {
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

function isVoiceUndoCommand(commandText: string): boolean {
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

function isVoiceImproveSelectionCommand(commandText: string): boolean {
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

function isCreateNoteCommand(commandText: string): boolean {
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

function extractCreateNoteCommandSegment(commandText: string): string | null {
  const pattern =
    /(?:\u0441\u043e\u0437\u0434\u0430|\u0441\u0434\u0435\u043b\u0430\u0439|\u0441\u0434\u0435\u043b\u0430\u0442\u044c|\u0437\u0430\u0432\u0435\u0434|\u0441\u043e\u0445\u0440\u0430\u043d\u0438|create|make|draft|new\s+note)/giu;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(commandText)) !== null) {
    lastMatch = match;
  }

  return lastMatch ? commandText.slice(lastMatch.index).trim() : null;
}

function isResearchNoteCommand(commandText: string): boolean {
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

function isVoiceReadLastAnswerCommand(commandText: string): boolean {
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

function isVoiceStopSpeakingCommand(commandText: string): boolean {
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

function isOpenLastFileReference(commandText: string): boolean {
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

function isPlainOpenFileCommand(commandText: string): boolean {
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

function isBareOpenFileCorrection(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  return /^(?:\u0438\u043c\u0435\u043d\u043d\u043e|\u0442\u043e\u0447\u043d\u043e)\s+[\p{L}\p{N}_ -]{2,}$/iu.test(normalized);
}

function parseVoiceOpenFileQuery(commandText: string): string | null {
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
    /^(?:\u0430\s+|\u043d\u0443\s+|\u043b\u0430\u0434\u043d\u043e\s+|\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430\s+)*(?:\u043e\u0442\u043a\u0440\u043e\u0439|\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0439|\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c|\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u044e|\u043e\u0442\u043a\u0440\u044b\u0442\u044c|\u043f\u043e\u043a\u0430\u0436\u0438|show|open)\s+(?:\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430\s+)?(?:\u043c\u043d\u0435\s+)?(?:(?:\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430|\u0442\u043e\u0447\u043d\u0435\u0435|\u0442\u043e\u0433\u0434\u0430)\s+)?(?:(?:\u0444\u0430\u0439\u043b|\u0437\u0430\u043c\u0435\u0442\u043a\u0443|\u043d\u043e\u0443\u0441|note)\s+)?([\s\S]+)$/i,
    /^(?:\u0430\s+|\u043d\u0443\s+|\u043b\u0430\u0434\u043d\u043e\s+|\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430\s+)*(?:(?:\u043c\u043e\u0436\u043d\u043e|\u043c\u043e\u0436\u0435\u0448\u044c|\u043c\u043e\u0436\u0435\u0442\u0435|can\s+you)\s+)?(?:\u043e\u0442\u043a\u0440\u044b\u0442\u044c|\u043f\u043e\u043a\u0430\u0437\u0430\u0442\u044c|open|show)\s+(?:\u043c\u043d\u0435\s+)?(?:(?:\u0444\u0430\u0439\u043b|\u0437\u0430\u043c\u0435\u0442\u043a\u0443|\u043d\u043e\u0443\u0441|note)\s+)?([\s\S]+)$/i,
    /^(?:\u0438\u043c\u0435\u043d\u043d\u043e|\u0442\u043e\u0447\u043d\u043e)\s+([\s\S]+)$/i,
    /^(?:открой|открывай|открываем|открываю|открыть|покажи|show|open)\s+(?:пожалуйста\s+)?(?:мне\s+)?(?:(?:пожалуйста|точнее|тогда)\s+)?(?:(?:файл|заметку|ноус|note)\s+)?([\s\S]+)$/i,
    /^(?:можешь\s+)?(?:открыть|показать)\s+(?:мне\s+)?(?:(?:файл|заметку|ноус)\s+)?([\s\S]+)$/i
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

function cleanVoiceOpenFileQuery(text: string): string {
  const query = cleanVoiceSearchQuery(text)
    .replace(/\b(?:файл|заметк[ауи]?|ноус|note)\b/gi, " ")
    .replace(/\bстат\s*(\d+)\b/gi, "stat$1")
    .replace(/\bstat\s+(\d+)\b/gi, "stat$1")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:его|ее|её|это|этот|найденный|найденное|it|that)$/i.test(query)
    ? ""
    : query;
}

function extractRequestedFolderName(commandText: string): string | null {
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

function parseOpenFileQueryParts(query: string): OpenFileQueryParts {
  const folderQuery = extractRequestedFolderName(query) ?? undefined;
  const fileQuery = folderQuery
    ? stripRequestedFolderClause(query, folderQuery)
    : query;

  return {
    fileQuery: cleanLooseOpenFileQuery(fileQuery) || query,
    folderQuery: folderQuery ? cleanLooseOpenFileQuery(folderQuery) : undefined
  };
}

function stripRequestedFolderClause(query: string, folderQuery: string): string {
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

function cleanLooseOpenFileQuery(query: string): string {
  return query
    .replace(/(?:^|[\s,;:])(?:в|из)\s+(?:папк|парк)[еи](?=$|[\s,;:.!?])/giu, " ")
    .replace(/(?:^|[\s,;:])(?:(?:папк|парк)[аеуы]?|folder)(?=$|[\s,;:.!?])/giu, " ")
    .replace(/(?:^|[\s,;:])(?:файл|заметк[ауи]?|ноус|note)(?=$|[\s,;:.!?])/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreVaultFolderCandidate(
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

function scoreOpenFileCandidate(
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

function tokenizeOpenFileQuery(query: string): string[] {
  return Array.from(
    new Set(
      normalizeOpenFileValue(query)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function normalizeOpenFileValue(value: string): string {
  return transliterateCyrillicToLatin(value.toLowerCase())
    .replace(/\.md\b/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/(?:^|[^\p{L}\p{N}_-])stat\s*(\d+)(?=$|[^\p{L}\p{N}_-])/giu, " stat$1")
    .replace(/\bstat\s+(\d+)\b/gi, "stat$1")
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateCyrillicToLatin(value: string): string {
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

function getBestTokenSimilarity(queryToken: string, target: string): number {
  return target
    .split(/\s+/)
    .filter(Boolean)
    .reduce(
      (best, targetToken) =>
        Math.max(best, getOpenFileSimilarity(queryToken, targetToken)),
      0
    );
}

function getOpenFileSimilarity(left: string, right: string): number {
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

function getConsonantSkeleton(value: string): string {
  return value.replace(/[aeiouyаеёиоуыэюя\s_-]+/giu, "");
}

function getNormalizedLevenshteinSimilarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);

  if (!maxLength) {
    return 1;
  }

  return 1 - levenshteinDistance(left, right) / maxLength;
}

function levenshteinDistance(left: string, right: string): number {
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

function shouldRouteThroughSemanticIntentRouter(
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

function shouldTrySemanticLocalCommand(commandText: string): boolean {
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

function shouldPreventLocalCommandChatFallback(commandText: string): boolean {
  const normalized = normalizeVoiceCommandText(commandText);

  if (!normalized || isQuestionAboutLocalCommand(normalized)) {
    return false;
  }

  return hasLocalCommandActionMarker(commandText);
}

function isQuestionAboutLocalCommand(normalizedText: string): boolean {
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

function parseSemanticLocalCommand(
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

function isSemanticLocalAction(
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

function findMarkdownPathsInText(text: string, files: TFile[]): string[] {
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

function parseVoiceVaultSearchQuery(commandText: string): string | null {
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

function parseVoiceWebResearchQuery(commandText: string): string | null {
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

function parseVoiceSemanticVaultQuery(commandText: string): string | null {
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

function parseVoiceMemoryIntent(commandText: string): VoiceMemoryIntent | null {
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

function parseVoiceNoteAction(commandText: string): VoiceNoteAction | null {
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

function normalizeVoiceCommandText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()[\]{}"'«»“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLlmRequestContext(context: LlmRequestContext): boolean {
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

function inferCurrentNoteReplacementTarget(content: string): string | null {
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

function countOccurrences(content: string, search: string): number {
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

function getUniqueOccurrenceIndex(content: string, search: string): number | undefined {
  return countOccurrences(content, search) === 1 ? 0 : undefined;
}

function findUniqueTextOccurrence(
  content: string,
  requestedText: string
): { match: TextOccurrenceMatch; error: null } | { match: null; error: string } {
  return findUniqueTextOccurrenceInContent(content, requestedText);
}

function findFlexibleWhitespaceMatches(
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSelectedOccurrence(
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

function replaceNthOccurrence(
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
