export const VIEW_TYPE_CONTEXT_AGENT = "mindo-view";

export type TtsProvider =
  | "disabled"
  | "browser"
  | "kokoro"
  | "silero";
export type TtsReadMode = "full" | "short";
export type SttModel =
  | "tiny"
  | "base"
  | "small"
  | "medium"
  | "large-v3"
  | "large-v3-turbo"
  | "nvidia/parakeet-tdt-0.6b-v3";
export type SttBackend = "faster-whisper" | "parakeet";
export type SttQualityMode = "speed" | "balanced" | "quality";
export type WebSearchProvider = "searxng" | "duckduckgo";
export type UiLanguage = "en" | "ru";
export type UiFontMode = "comfortaa" | "obsidian";
export type DialogueModelMode = "single" | "dual";
export type WikiMemoryMode = "manual" | "assisted" | "auto-safe";
export type WebSourceType =
  | "news"
  | "release"
  | "blog"
  | "guide"
  | "docs"
  | "reference";
export type PronunciationDictionary = Record<string, string>;

export interface LlmModelProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  supportsVision: boolean;
}

export interface ContexSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  supportsVision: boolean;
  modelProfiles: LlmModelProfile[];
  activeModelProfileId: string;
  dialogueModelMode: DialogueModelMode;
  dialogueFastModelProfileId: string;
  dialogueSmartModelProfileId: string;
  sttEndpoint: string;
  sttBackend: SttBackend;
  autoStartLocalStt: boolean;
  sttModel: SttModel;
  sttQualityMode: SttQualityMode;
  sttLanguage: string;
  sttBeamSize: number;
  sttInitialPrompt: string;
  ttsProvider: TtsProvider;
  ttsReadMode: TtsReadMode;
  autoStartLocalTts: boolean;
  fallbackToBrowserTts: boolean;
  kokoroTtsEndpoint: string;
  kokoroVoice: string;
  kokoroModel: string;
  sileroTtsEndpoint: string;
  sileroVoice: string;
  sileroPronunciationDictionary: PronunciationDictionary;
  webSearchEnabled: boolean;
  webSearchProvider: WebSearchProvider;
  webSearchEndpoint: string;
  webSearchMaxResults: number;
  uiLanguage: UiLanguage;
  uiFont: UiFontMode;
  autoApplyEdits: boolean;
  wikiEnabled: boolean;
  wikiRootFolder: string;
  wikiMemoryMode: WikiMemoryMode;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: LlmFileAttachment[] | null;
  actionReceipt?: ActionReceipt;
  diffPreview?: TextDiffPreview;
  vaultSearchQuery?: string;
  vaultSearchResults?: VaultSearchResult[];
  webResearchQuery?: string;
  webSearchQuery?: string;
  webResearchResults?: WebSearchResult[];
  webResearchProvider?: string;
  webResearchFallbackReason?: string;
  semanticVaultQuery?: string;
  semanticVaultSections?: VaultSourceSection[];
  sources?: VaultSearchResult[];
  webSources?: WebSearchResult[];
}

export interface ActionReceipt {
  status:
    | "done"
    | "preview"
    | "opened"
    | "saved"
    | "reverted"
    | "rejected"
    | "failed"
    | "needs_confirmation";
  label: string;
  detail?: string;
  path?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  sessions: ChatSession[];
  activeChatId: string | null;
}

export interface TextDiffPreview {
  title: string;
  sourcePath: string;
  historyOperationId?: string;
  operationType?: string;
  originalOccurrenceIndex?: number;
  original: string;
  suggested: string;
  status: "pending" | "applied" | "rejected" | "reverted";
  userPrompt?: string;
}

export interface CurrentNoteContext {
  path: string;
  name: string;
  content: string;
  isTruncated: boolean;
  originalLength: number;
  includedLength: number;
}

export interface SelectedTextContext {
  path: string;
  name: string;
  text: string;
  isTruncated: boolean;
  originalLength: number;
  includedLength: number;
}

export interface LlmRequestContext {
  currentNote?: CurrentNoteContext | null;
  selectedText?: SelectedTextContext | null;
  vaultResults?: VaultSearchResult[] | null;
  projectMemory?: string | null;
  attachments?: LlmFileAttachment[] | null;
  webResults?: WebSearchResult[] | null;
  webResearchQuery?: string | null;
  webSearchQuery?: string | null;
  webResearchProvider?: string | null;
  webResearchFallbackReason?: string | null;
  webResearchReason?: string | null;
  liveDialogue?: boolean;
}

export interface LlmFileAttachment {
  name: string;
  type: string;
  size: number;
  text?: string;
  dataUrl?: string;
}

export interface VaultSearchResult {
  path: string;
  title: string;
  score: number;
  snippet: string;
  heading?: string;
  matches?: string[];
}

export interface VaultSourceSection {
  path: string;
  title: string;
  heading: string;
  excerpt: string;
  score: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
  score?: number;
  sourceType?: WebSourceType;
  freshnessHint?: string;
  qualityNotes?: string[];
}

export const DEFAULT_SETTINGS: ContexSettings = {
  baseUrl: "http://127.0.0.1:8085/v1",
  apiKey: "dummy",
  model: "gemma-4-e4b-it",
  temperature: 0.3,
  supportsVision: true,
  modelProfiles: [
    {
      id: "local-gemma",
      name: "Local Gemma",
      baseUrl: "http://127.0.0.1:8085/v1",
      apiKey: "dummy",
      model: "gemma-4-e4b-it",
      temperature: 0.3,
      supportsVision: true
    }
  ],
  activeModelProfileId: "local-gemma",
  dialogueModelMode: "single",
  dialogueFastModelProfileId: "local-gemma",
  dialogueSmartModelProfileId: "local-gemma",
  sttEndpoint: "http://127.0.0.1:9000/transcribe",
  sttBackend: "parakeet",
  autoStartLocalStt: true,
  sttModel: "nvidia/parakeet-tdt-0.6b-v3",
  sttQualityMode: "quality",
  sttLanguage: "auto",
  sttBeamSize: 5,
  sttInitialPrompt:
    "Russian speech with technical terms: Mindo, Obsidian, Markdown, BitNet, vault, rollback, Kokoro, Silero, Whisper, local LLM.",
  ttsProvider: "silero",
  ttsReadMode: "full",
  autoStartLocalTts: true,
  fallbackToBrowserTts: false,
  kokoroTtsEndpoint: "http://127.0.0.1:9200/v1/audio/speech",
  kokoroVoice: "af_heart",
  kokoroModel: "onnx-community/Kokoro-82M-v1.0-ONNX",
  sileroTtsEndpoint: "http://127.0.0.1:9100/speech",
  sileroVoice: "eugene",
  webSearchEnabled: false,
  webSearchProvider: "duckduckgo",
  webSearchEndpoint: "http://127.0.0.1:8080/search",
  webSearchMaxResults: 6,
  uiLanguage: "en",
  uiFont: "comfortaa",
  autoApplyEdits: false,
  wikiEnabled: true,
  wikiRootFolder: "Mindo Wiki",
  wikiMemoryMode: "auto-safe",
  sileroPronunciationDictionary: {
    Markdown: "маркдаун",
    ONNX: "он эн эн икс",
    LoopLM: "луп эл эм",
    BitNet: "битнет",
    Mindo: "миндо",
    Obsidian: "обсидиан",
    WebGPU: "веб джи пи ю",
    STT: "эс ти ти",
    TTS: "ти ти эс",
    LLM: "эл эл эм",
    AI: "эй ай"
  }
};
