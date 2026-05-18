import assert from "node:assert/strict";
import {
  cleanSuggestedReplacement,
  decideAutoWebResearch,
  normalizeNoisyLocalCommandText,
  parseVoiceOpenFileQuery,
  shouldUseWebForResearchWorkflow
} from "../src/views/sidebarPureHelpers";

assert.equal(
  cleanSuggestedReplacement("```markdown\n# Title\n\nBody\n```"),
  "# Title\n\nBody"
);

const noisyOpen = normalizeNoisyLocalCommandText(
  "\u041e\u0442\u043a\u0440\u043e\u044e \u0442\u0435\u0441\u0442, \u0432\u0430\u043f\u043a\u0438 \u0442\u0435\u0441\u0442"
);

assert.match(noisyOpen, /\u043e\u0442\u043a\u0440\u043e\u0439/i);
assert.match(noisyOpen, /\u0432 \u043f\u0430\u043f\u043a\u0435/i);

assert.equal(
  parseVoiceOpenFileQuery("open file Test in folder Test"),
  "Test in folder Test"
);

assert.equal(
  parseVoiceOpenFileQuery(
    "\u0410 \u043c\u043e\u0436\u043d\u043e \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u043d\u0435 \u041e\u043a\u043a\u043e \u0441\u0438\u0441\u0442\u0435\u043c \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u0439 \u0444\u0430\u0439\u043b?"
  ),
  "\u041e\u043a\u043a\u043e \u0441\u0438\u0441\u0442\u0435\u043c \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u0439"
);

assert.equal(
  parseVoiceOpenFileQuery(
    "\u0438\u043c\u0435\u043d\u043d\u043e \u041a\u043e\u0440 \u0441\u0438\u0441\u0442\u0435\u043c \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438"
  ),
  "\u041a\u043e\u0440 \u0441\u0438\u0441\u0442\u0435\u043c \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438"
);

assert.equal(decideAutoWebResearch("Explain Web Components"), null);
assert.equal(decideAutoWebResearch("What is in the current note?"), null);
assert.equal(decideAutoWebResearch("What's in the current note?"), null);
assert.equal(decideAutoWebResearch("Tell me about the current note"), null);
assert.notEqual(decideAutoWebResearch("Find current note-taking apps"), null);
assert.equal(
  decideAutoWebResearch("search the web for Web Components")?.query,
  "search the web for Web Components"
);
assert.equal(
  decideAutoWebResearch("Describe Web Components with web research")?.query,
  "Describe Web Components with web research"
);
assert.equal(shouldUseWebForResearchWorkflow("Describe Web Components"), false);
assert.equal(
  shouldUseWebForResearchWorkflow("search the web for Web Components"),
  true
);
assert.equal(
  shouldUseWebForResearchWorkflow("Describe Web Components with web sources"),
  true
);

console.log("sidebarPureHelpers tests passed");
