import assert from "node:assert/strict";
import { SemanticLocalCommandClassifier } from "../src/views/controllers/SemanticLocalCommandClassifier";

const markdownFiles = [
  { path: "Test/Test.md" },
  { path: "lumiq/lumiq.md" },
  { path: "Obisidian/Фишки obsidian.md" }
];

{
  let capturedPrompt = "";
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => markdownFiles
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => ({
      file: { path: "Test/Test.md" } as any,
      content: "Я гений\nOld local LLM note."
    }),
    findLastMentionedMarkdownPaths: () => ["Obisidian/Фишки obsidian.md"],
    getLastFoundFilePaths: () => ["lumiq/lumiq.md"],
    requestCompletion: async (_settings, messages) => {
      capturedPrompt = messages[0]?.content ?? "";
      return JSON.stringify({
        actions: [
          {
            action: "open_file",
            query: "Test/Test.md"
          },
          {
            action: "replace_text",
            original: "Я гений",
            suggested: "Я человек"
          }
        ]
      });
    }
  });

  const plan = await classifier.classifyPlan(
    "Открой тест в папке тест и поменяй Я гений на Я человек.",
    "тест в папке тест и поменяй Я гений на Я человек"
  );

  assert.equal(plan?.length, 2);
  assert.equal(plan?.[0]?.action, "open_file");
  assert.equal(plan?.[0]?.query, "Test/Test.md");
  assert.equal(plan?.[1]?.action, "replace_text");
  assert.match(capturedPrompt, /Active note path: Test\/Test\.md/);
  assert.match(capturedPrompt, /Corrected\/latest command segment:/);
  assert.match(capturedPrompt, /Test\/Test\.md/);
}

{
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => markdownFiles
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => null,
    findLastMentionedMarkdownPaths: () => [],
    getLastFoundFilePaths: () => [],
    requestCompletion: async () => JSON.stringify({ action: "none" })
  });

  assert.equal(await classifier.classifyPlan("Привет"), null);
  assert.equal(await classifier.classifyFirst("Привет"), null);
}

{
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => markdownFiles
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => ({
      file: { path: "Test/Test.md" } as any,
      content: "Current note should not win when another file is named."
    }),
    findLastMentionedMarkdownPaths: () => [],
    getLastFoundFilePaths: () => [],
    requestCompletion: async () =>
      JSON.stringify({
        action: "open_file",
        query: "open the current note",
        candidatePath: "lumiq/lumiq.md"
      })
  });

  const plan = await classifier.classifyPlan("Open LUMIK");
  const openFile = plan?.[0] as any;

  assert.equal(openFile?.action, "open_file");
  assert.equal(openFile?.query, "lumiq/lumiq.md");
  assert.equal(openFile?.candidatePath, "lumiq/lumiq.md");
}

{
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => [
          { path: "Inbox/Current.md" },
          { path: "Research/Source.md" },
          { path: "Research/Qore Systems Strategy.md" },
          { path: "Projects/Mindo.md" }
        ]
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => ({
      file: { path: "Inbox/Current.md" } as any,
      content: "Current note points to a nearby research folder."
    }),
    findLastMentionedMarkdownPaths: () => ["Research/Source.md"],
    getLastFoundFilePaths: () => [],
    requestCompletion: async () =>
      JSON.stringify({
        action: "open_file",
        query: "nearby research note",
        candidatePath: "Research/Qore Systems Strategy.md"
      })
  });

  const plan = await classifier.classifyPlan("Open the briefing from nearby context");
  const openFile = plan?.[0] as any;

  assert.equal(openFile?.action, "open_file");
  assert.equal(openFile?.query, "Research/Qore Systems Strategy.md");
  assert.equal(openFile?.candidatePath, "Research/Qore Systems Strategy.md");
}

{
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => [
          { path: "Inbox/Current.md" },
          { path: "Research/Source.md" },
          { path: "Research/Qore Systems Strategy.md" }
        ]
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => ({
      file: { path: "Inbox/Current.md" } as any,
      content: "Current note points to a nearby research folder."
    }),
    findLastMentionedMarkdownPaths: () => ["Research/Source.md"],
    getLastFoundFilePaths: () => [],
    requestCompletion: async () =>
      JSON.stringify({
        action: "open_file",
        query: "some missing note"
      })
  });

  assert.equal(await classifier.classifyPlan("Open whatever is nearby"), null);
}

{
  const classifier = new SemanticLocalCommandClassifier({
    app: {
      vault: {
        getMarkdownFiles: () => [
          { path: "Projects/Mindo.md" },
          { path: "Archive/Mindo.md" }
        ]
      }
    } as any,
    getSettings: () => ({ model: "test-model" }) as any,
    readActiveMarkdownNote: async () => ({
      file: { path: "Inbox/Current.md" } as any,
      content: "Current note must not receive an ambiguous open-then-edit plan."
    }),
    findLastMentionedMarkdownPaths: () => [],
    getLastFoundFilePaths: () => [],
    requestCompletion: async () =>
      JSON.stringify({
        actions: [
          {
            action: "open_file",
            query: "Mindo"
          },
          {
            action: "replace_text",
            original: "Current note",
            suggested: "Wrong note"
          }
        ]
      })
  });

  assert.equal(await classifier.classifyPlan("Open Mindo and change text"), null);
  assert.equal(await classifier.classifyFirst("Open Mindo"), null);
}

console.log("semanticLocalCommandClassifier tests passed");
