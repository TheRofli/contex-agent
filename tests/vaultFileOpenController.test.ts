import assert from "node:assert/strict";
import { VaultFileOpenController } from "../src/views/controllers/VaultFileOpenController";
import type { VoiceSessionMemory } from "../src/views/sidebarTypes";

interface FakeFile {
  path: string;
  basename: string;
}

const files: FakeFile[] = [
  { path: "Test/Test.md", basename: "Test" },
  { path: "lumiq/stat1.md", basename: "stat1" },
  { path: "lumiq/lumiq.md", basename: "lumiq" },
  { path: "Proton/Qore Systems Cases.md", basename: "Qore Systems Cases" },
  { path: "Proton/Qore Systems Strategy.md", basename: "Qore Systems Strategy" }
];

const memory: VoiceSessionMemory = {
  activeFolder: null,
  lastOpenedFile: null,
  lastFoundFiles: [],
  updatedAt: 0
};
const opened: string[] = [];
const openedLinks: string[] = [];
const statuses: string[] = [];
const errors: (string | null)[] = [];
const contextDetails: string[] = [];

const controller = new VaultFileOpenController<FakeFile>({
  getMarkdownPaths: () => files.map((file) => file.path),
  getFileByPath: (path) => files.find((file) => file.path === path) ?? null,
  openFileInWorkspace: async (file) => {
    opened.push(file.path);
  },
  openLinkText: async (linkText) => {
    openedLinks.push(linkText);
  },
  getVoiceSessionMemory: () => memory,
  setContextDetail: (message) => {
    contextDetails.push(message);
  },
  setError: (error) => errors.push(error),
  setStatus: (status) => statuses.push(status),
  now: () => 12345
});

assert.equal(
  controller.resolveOpenFileCandidate("открой тест в папке тест")?.path,
  "Test/Test.md"
);
assert.equal(
  controller.resolveOpenFileCandidate("открой lumiq в папке lumiq")?.path,
  "lumiq/lumiq.md"
);

const qoreDecision = controller.resolveOpenFileDecision("qore systems");
assert.equal(qoreDecision.kind, "clarify");
assert.deepEqual(
  qoreDecision.kind === "clarify"
    ? qoreDecision.candidates.map((candidate) => candidate.path)
    : [],
  ["Proton/Qore Systems Cases.md", "Proton/Qore Systems Strategy.md"]
);
assert.equal(controller.resolveOpenFileCandidate("qore systems"), null);

await controller.openVaultPath("Test/Test.md", "Opened test");

assert.deepEqual(opened, ["Test/Test.md"]);
assert.equal(memory.lastOpenedFile, "Test/Test.md");
assert.equal(memory.activeFolder, "Test");
assert.equal(memory.updatedAt, 12345);
assert.equal(contextDetails.at(-1), "Opened test");
assert.equal(statuses.at(-1), "Status: Opened file");

await controller.openVaultPath("lumiq/lumiq.md", "Opened heading", "Intro");

assert.equal(openedLinks.at(-1), "lumiq/lumiq.md#Intro");
assert.equal(memory.lastOpenedFile, "lumiq/lumiq.md");
assert.equal(memory.activeFolder, "lumiq");

await controller.openVaultPath("Missing.md", "Missing file");

assert.equal(errors.at(-1), "Could not find file: Missing.md");
assert.equal(statuses.at(-1), "Status: Open failed");

console.log("vaultFileOpenController tests passed");
