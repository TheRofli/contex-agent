import assert from "node:assert/strict";

import { buildAutoWebContext } from "../src/chat/autoWebContextBuilder";

const webResult = {
  title: "Fresh local LLM update",
  url: "https://example.com/local-llm",
  snippet: "Local LLMs improved this week."
};

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    userRequest: "latest local LLM news",
    context: null,
    settings: {
      webSearchEnabled: true
    },
    isLocalOnlyCommandText: () => false,
    planContextWorkflow: () => ({
      requiresWeb: false,
      reason: "not needed"
    }),
    decideAutoWebResearch: () => ({
      query: "latest local LLM news",
      reason: "freshness requested"
    }),
    buildAutoWebResearchQuery: () => "fallback query",
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

  const context = await buildAutoWebContext(
    baseOptions({
      isLocalOnlyCommandText: () => true,
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

  const context = await buildAutoWebContext(
    baseOptions({
      settings: {
        webSearchEnabled: false
      },
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

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "Find qore systems strategy in my vault",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "qore systems strategy",
        reason: "freshness requested"
      }),
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

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "What is in the current note?",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "current note",
        reason: "freshness requested"
      }),
      planContextWorkflow: () => ({
        requiresWeb: true,
        reason: "time-sensitive request"
      }),
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

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "What is in the current note about internet architecture?",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "internet architecture",
        reason: "web requested"
      }),
      planContextWorkflow: () => ({
        requiresWeb: true,
        reason: "time-sensitive request"
      }),
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

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "What is in the current note? Search the internet too.",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "current note internet",
        reason: "web requested"
      }),
      searchWeb: async (_settings: unknown, query: string) => {
        searched = true;
        return {
          provider: "duckduckgo",
          fallbackReason: query.includes("May") ? "direct" : undefined,
          results: [webResult]
        };
      }
    })
  );

  assert.equal(searched, true);
  assert.equal(context?.provider, "duckduckgo");
}

{
  let searched = false;

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "Summarize this note and use Web Components examples",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "web components examples",
        reason: "web requested"
      }),
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

  const context = await buildAutoWebContext(
    baseOptions({
      userRequest: "Summarize this note and use the web",
      isLocalOnlyCommandText: () => false,
      decideAutoWebResearch: () => ({
        query: "current note web",
        reason: "web requested"
      }),
      searchWeb: async (_settings: unknown, query: string) => {
        searched = true;
        return {
          provider: "duckduckgo",
          fallbackReason: query.includes("May") ? "direct" : undefined,
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
  const timeline: string[] = [];

  const context = await buildAutoWebContext(
    baseOptions({
      onStatus: (status: string) => statuses.push(status),
      onTimeline: (type: string, label: string, detail?: string) =>
        timeline.push(`${type}:${label}:${detail ?? ""}`)
    })
  );

  assert.equal(context?.query, "latest local LLM news");
  assert.equal(context?.searchQuery, "latest local LLM news May 2026");
  assert.equal(context?.reason, "freshness requested");
  assert.equal(context?.provider, "duckduckgo");
  assert.equal(context?.fallbackReason, "direct");
  assert.equal(context?.results[0], webResult);
  assert.deepEqual(statuses, ["Status: Checking current web"]);
  assert.deepEqual(timeline, ["searching:Checking current web:latest local LLM news"]);
}

{
  const context = await buildAutoWebContext(
    baseOptions({
      decideAutoWebResearch: () => null,
      planContextWorkflow: () => ({
        requiresWeb: true,
        reason: "time-sensitive request"
      }),
      buildAutoWebResearchQuery: (request: string) => `${request} current`
    })
  );

  assert.equal(context?.query, "latest local LLM news current");
  assert.equal(context?.reason, "time-sensitive request");
}

{
  const timeline: string[] = [];

  const context = await buildAutoWebContext(
    baseOptions({
      searchWeb: async () => ({
        provider: "duckduckgo",
        results: []
      }),
      onTimeline: (type: string, label: string, detail?: string) =>
        timeline.push(`${type}:${label}:${detail ?? ""}`)
    })
  );

  assert.equal(context, null);
  assert.deepEqual(timeline, [
    "searching:Checking current web:latest local LLM news",
    "done:Web search returned no results:latest local LLM news May 2026"
  ]);
}

{
  const timeline: string[] = [];
  const errors: string[] = [];

  const context = await buildAutoWebContext(
    baseOptions({
      searchWeb: async () => {
        throw new Error("network down");
      },
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : String(error),
      onError: (error: unknown) => errors.push((error as Error).message),
      onTimeline: (type: string, label: string, detail?: string) =>
        timeline.push(`${type}:${label}:${detail ?? ""}`)
    })
  );

  assert.equal(context, null);
  assert.deepEqual(errors, ["network down"]);
  assert.deepEqual(timeline, [
    "searching:Checking current web:latest local LLM news",
    "failed:Auto web research failed:network down"
  ]);
}

console.log("autoWebContextBuilder tests passed");
