import assert from "node:assert/strict";

import {
  RESEARCH_WORKFLOW_WEB_REASON,
  buildResearchWorkflowWebContext
} from "../src/web/researchWorkflowWebContext";

const webResult = {
  title: "Local AI workstations",
  url: "https://example.com/local-ai",
  snippet: "Local AI workstation trends in 2026."
};

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    commandText: "создай заметку про современные локальные LLM",
    context: null,
    settings: {
      webSearchEnabled: true
    },
    buildAutoWebContextForRequest: async () => null,
    shouldUseWebForResearchWorkflow: () => true,
    buildAutoWebResearchQuery: (commandText: string) => `${commandText} current`,
    rewriteWebResearchQuery: async (query: string) => `${query} May 2026`,
    searchWeb: async (_settings: unknown, query: string) => ({
      provider: "duckduckgo",
      fallbackReason: query.includes("May") ? "direct" : undefined,
      results: [webResult]
    }),
    ...overrides
  };
}

{
  let searched = false;
  const existing = {
    query: "existing",
    searchQuery: "existing",
    reason: "auto web",
    provider: "duckduckgo",
    results: [webResult]
  };

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      buildAutoWebContextForRequest: async () => existing,
      searchWeb: async () => {
        searched = true;
        return {
          provider: "duckduckgo",
          results: [webResult]
        };
      }
    })
  );

  assert.equal(context, existing);
  assert.equal(searched, false);
}

{
  let searched = false;

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      settings: {
        webSearchEnabled: false
      },
      searchWeb: async () => {
        searched = true;
        return {
          provider: "duckduckgo",
          results: [webResult]
        };
      }
    })
  );

  assert.equal(context, null);
  assert.equal(searched, false);
}

{
  let rewritten = false;

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      shouldUseWebForResearchWorkflow: () => false,
      rewriteWebResearchQuery: async (query: string) => {
        rewritten = true;
        return query;
      }
    })
  );

  assert.equal(context, null);
  assert.equal(rewritten, false);
}

{
  let searched = false;

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      commandText: "Summarize the current note about Web Components",
      shouldUseWebForResearchWorkflow: () => true,
      searchWeb: async () => {
        searched = true;
        return {
          provider: "duckduckgo",
          results: [webResult]
        };
      }
    })
  );

  assert.equal(context, null);
  assert.equal(searched, false);
}

{
  let searched = false;

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      commandText: "Describe the current note and use the web",
      shouldUseWebForResearchWorkflow: () => true,
      searchWeb: async (_settings: unknown, query: string) => {
        searched = true;
        return {
          provider: "duckduckgo",
          fallbackReason: query.includes("current") ? "direct" : undefined,
          results: [webResult]
        };
      }
    })
  );

  assert.equal(searched, true);
  assert.equal(context?.provider, "duckduckgo");
}

{
  const statuses: string[] = [];

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      onStatus: (status: string) => statuses.push(status)
    })
  );

  assert.equal(
    context?.query,
    "создай заметку про современные локальные LLM current"
  );
  assert.equal(
    context?.searchQuery,
    "создай заметку про современные локальные LLM current May 2026"
  );
  assert.equal(context?.reason, RESEARCH_WORKFLOW_WEB_REASON);
  assert.equal(context?.provider, "duckduckgo");
  assert.equal(context?.fallbackReason, "direct");
  assert.equal(context?.results[0], webResult);
  assert.deepEqual(statuses, ["Status: Researching web"]);
}

{
  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      searchWeb: async () => ({
        provider: "duckduckgo",
        results: []
      })
    })
  );

  assert.equal(context, null);
}

{
  const errors: string[] = [];

  const context = await buildResearchWorkflowWebContext(
    baseOptions({
      searchWeb: async () => {
        throw new Error("network down");
      },
      onError: (error: unknown) => errors.push((error as Error).message)
    })
  );

  assert.equal(context, null);
  assert.deepEqual(errors, ["network down"]);
}

console.log("researchWorkflowWebContext tests passed");
