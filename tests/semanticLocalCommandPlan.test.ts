import assert from "node:assert/strict";
import { parseSemanticLocalCommandPlan } from "../src/views/semanticLocalCommandPlan";

const single = parseSemanticLocalCommandPlan(`
\`\`\`json
{"action":"research_note","query":"create a modern local LLM feature page with web research"}
\`\`\`
`);

assert.equal(single?.length, 1);
assert.equal(single?.[0]?.action, "research_note");
assert.equal(
  single?.[0]?.query,
  "create a modern local LLM feature page with web research"
);

const multi = parseSemanticLocalCommandPlan(
  JSON.stringify({
    actions: [
      {
        action: "open_file",
        query: "test in folder Test",
        candidatePath: "Test/Test.md"
      },
      {
        action: "replace_text",
        replacements: [
          {
            original: "I am old text",
            suggested: "I am new text"
          }
        ]
      }
    ]
  })
);

assert.equal(multi?.length, 2);
assert.equal(multi?.[0]?.action, "open_file");
assert.equal(multi?.[0]?.candidatePath, "Test/Test.md");
assert.equal(multi?.[1]?.action, "replace_text");
assert.deepEqual(multi?.[1]?.replacements, [
  {
    original: "I am old text",
    suggested: "I am new text"
  }
]);

const invalid = parseSemanticLocalCommandPlan(
  JSON.stringify({
    actions: [
      { action: "none" },
      { action: "delete_everything" },
      { action: "read_last_answer" }
    ]
  })
);

assert.equal(invalid?.length, 1);
assert.equal(invalid?.[0]?.action, "read_last_answer");

console.log("semanticLocalCommandPlan tests passed");
