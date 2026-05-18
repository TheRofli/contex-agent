import type { ContexSettings, LlmRequestContext, WebSearchResult } from "../types";
import type { AutoWebContext } from "../views/sidebarTypes";
import {
  hasExplicitWebIntent,
  isVaultLocalDescriptionRequest
} from "../chat/autoWebGuards";

export const RESEARCH_WORKFLOW_WEB_REASON =
  "Research workflow used web context because the task appears to depend on current technologies, tools, or recommendations.";

export interface ResearchWorkflowWebSearchResponse {
  provider: string;
  fallbackReason?: string;
  results: WebSearchResult[];
}

export interface BuildResearchWorkflowWebContextOptions<
  TSettings extends Pick<ContexSettings, "webSearchEnabled">
> {
  commandText: string;
  context: LlmRequestContext | null;
  settings: TSettings;
  buildAutoWebContextForRequest: (
    commandText: string,
    context: LlmRequestContext | null
  ) => Promise<AutoWebContext | null>;
  shouldUseWebForResearchWorkflow: (commandText: string) => boolean;
  buildAutoWebResearchQuery: (
    commandText: string,
    context: LlmRequestContext | null
  ) => string;
  rewriteWebResearchQuery: (query: string) => Promise<string>;
  searchWeb: (
    settings: TSettings,
    searchQuery: string
  ) => Promise<ResearchWorkflowWebSearchResponse>;
  onStatus?: (status: string) => void;
  onError?: (error: unknown) => void;
}

export async function buildResearchWorkflowWebContext<
  TSettings extends Pick<ContexSettings, "webSearchEnabled">
>(
  options: BuildResearchWorkflowWebContextOptions<TSettings>
): Promise<AutoWebContext | null> {
  const autoWebContext = await options.buildAutoWebContextForRequest(
    options.commandText,
    options.context
  );

  if (autoWebContext) {
    return autoWebContext;
  }

  if (
    isVaultLocalDescriptionRequest(options.commandText) &&
    !hasExplicitWebIntent(options.commandText)
  ) {
    return null;
  }

  if (
    !options.settings.webSearchEnabled ||
    !options.shouldUseWebForResearchWorkflow(options.commandText)
  ) {
    return null;
  }

  try {
    options.onStatus?.("Status: Researching web");
    const query = options.buildAutoWebResearchQuery(
      options.commandText,
      options.context
    );
    const searchQuery = await options.rewriteWebResearchQuery(query);
    const response = await options.searchWeb(options.settings, searchQuery);

    if (!response.results.length) {
      return null;
    }

    return {
      query,
      searchQuery,
      reason: RESEARCH_WORKFLOW_WEB_REASON,
      provider: response.provider,
      fallbackReason: response.fallbackReason,
      results: response.results
    };
  } catch (error) {
    options.onError?.(error);
    return null;
  }
}
