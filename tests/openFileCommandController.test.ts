import assert from "node:assert/strict";
import {
  OpenFileCommandController,
  type OpenFileCommandControllerDeps
} from "../src/views/controllers/OpenFileCommandController";
import type { ActionReceipt, VaultSearchResult } from "../src/types";

function createDeps(
  overrides: Partial<OpenFileCommandControllerDeps> = {}
): {
  controller: OpenFileCommandController;
  opened: string[];
  receipts: ActionReceipt[];
  statuses: string[];
  errors: Array<string | null>;
  timeline: Array<{ type: string; label: string; detail?: string; path?: string }>;
} {
  const opened: string[] = [];
  const receipts: ActionReceipt[] = [];
  const statuses: string[] = [];
  const errors: Array<string | null> = [];
  const timeline: Array<{
    type: string;
    label: string;
    detail?: string;
    path?: string;
  }> = [];

  const deps: OpenFileCommandControllerDeps = {
    getMarkdownPaths: () => [
      "Test/Test.md",
      "lumiq/lumiq.md",
      "lumiq/stat1.md"
    ],
    resolveDirectCandidate: () => null,
    resolvePathsWithRustCore: async () => [],
    searchSemanticVaultMarkdown: async () => [],
    openVaultPath: async (path) => {
      opened.push(path);
    },
    rememberVaultSearch: () => undefined,
    appendActionReceipt: (receipt) => {
      receipts.push(receipt);
    },
    pushActionTimeline: (type, label, detail, path) => {
      timeline.push({ type, label, detail, path });
    },
    setError: (error) => errors.push(error),
    setStatus: (status) => statuses.push(status),
    ...overrides
  };

  return {
    controller: new OpenFileCommandController(deps),
    opened,
    receipts,
    statuses,
    errors,
    timeline
  };
}

async function testDirectCandidateWins(): Promise<void> {
  let rustResolverCalls = 0;
  const { controller, opened, receipts, timeline } = createDeps({
    resolveDirectCandidate: () => ({
      path: "Test/Test.md",
      basename: "Test"
    }),
    resolvePathsWithRustCore: async () => {
      rustResolverCalls += 1;
      throw new Error("Rust fallback should not run for direct candidates");
    }
  });

  const result = await controller.openFileByVaultQuery(
    "test in folder test",
    "Open test in folder Test"
  );

  assert.equal(result, "Test/Test.md");
  assert.deepEqual(opened, ["Test/Test.md"]);
  assert.equal(receipts[0].status, "opened");
  assert.equal(receipts[0].path, "Test/Test.md");
  assert.match(receipts[0].detail ?? "", /folder: Test/);
  assert.equal(timeline.at(-1)?.type, "done");
  assert.equal(rustResolverCalls, 0);
}

async function testRustFallback(): Promise<void> {
  const remembered: Array<{ query: string; results: VaultSearchResult[] }> = [];
  const { controller, opened } = createDeps({
    resolvePathsWithRustCore: async () => [
      {
        path: "lumiq/lumiq.md",
        score: 88
      }
    ],
    rememberVaultSearch: (query, results) =>
      remembered.push({ query, results })
  });

  const result = await controller.openFileByVaultQuery(
    "runtime index",
    "Open runtime index"
  );

  assert.equal(result, "lumiq/lumiq.md");
  assert.deepEqual(opened, ["lumiq/lumiq.md"]);
  assert.equal(remembered[0].results[0].matches?.[0], "rust-core");
}

async function testNoSemanticContentFallbackAndFailure(): Promise<void> {
  let semanticSearchCalls = 0;
  const semantic = createDeps({
    searchSemanticVaultMarkdown: async () => {
      semanticSearchCalls += 1;
      return [
        {
          path: "lumiq/stat1.md",
          title: "stat1",
          score: 42,
          snippet: "stats"
        }
      ];
    }
  });

  assert.equal(
    await semantic.controller.openFileByVaultQuery("statistics", "Open statistics"),
    null
  );
  assert.deepEqual(semantic.opened, []);
  assert.equal(semanticSearchCalls, 0);

  const failed = createDeps();
  assert.equal(
    await failed.controller.openFileByVaultQuery("missing", "Open missing"),
    null
  );
  assert.match(failed.errors[0] ?? "", /Could not find/);
  assert.equal(failed.statuses.at(-1), "Status: Open failed");
  assert.equal(failed.timeline.at(-1)?.type, "failed");
}

async function testAmbiguousCandidateAsksForConfirmation(): Promise<void> {
  const remembered: Array<{ query: string; results: VaultSearchResult[] }> = [];
  const { controller, opened, receipts, statuses, timeline } = createDeps({
    getMarkdownPaths: () => [
      "Proton/Qore Systems Cases.md",
      "Proton/Qore Systems Strategy.md"
    ],
    rememberVaultSearch: (query, results) =>
      remembered.push({ query, results })
  });

  const result = await controller.openFileByVaultQuery(
    "qore systems",
    "Open qore systems"
  );

  assert.equal(result, null);
  assert.deepEqual(opened, []);
  assert.equal(receipts[0].status, "needs_confirmation");
  assert.equal(receipts[0].label, "Choose note");
  assert.match(receipts[0].detail ?? "", /Proton\/Qore Systems Cases\.md/);
  assert.match(receipts[0].detail ?? "", /Proton\/Qore Systems Strategy\.md/);
  assert.equal(remembered[0].results[0].snippet, "Close Markdown note match.");
  assert.equal(statuses.at(-1), "Status: Choose note");
  assert.equal(timeline.at(-1)?.type, "failed");
}

await testDirectCandidateWins();
await testRustFallback();
await testNoSemanticContentFallbackAndFailure();
await testAmbiguousCandidateAsksForConfirmation();

console.log("openFileCommandController tests passed");
