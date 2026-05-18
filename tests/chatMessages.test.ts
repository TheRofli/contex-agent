import assert from "node:assert/strict";
import {
  escapeMarkdownLinkText,
  findLatestUserMessage,
  formatActionReceiptStatus,
  serializeChatMessagesForNote,
  trimChatTitle
} from "../src/chat/chatMessages";
import type { ChatMessage } from "../src/types";

assert.equal(trimChatTitle("/search latest local LLM news"), "Search: latest local LLM news");
assert.equal(trimChatTitle(""), "New chat");
assert.equal(
  trimChatTitle("A very long title that needs to be trimmed because it will not fit"),
  "A very long title that needs to be..."
);

const messages: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    content: "Hello",
    createdAt: 1
  },
  {
    id: "user-1",
    role: "user",
    content: "Open note",
    createdAt: 2
  },
  {
    id: "assistant-2",
    role: "assistant",
    content: "",
    createdAt: 3,
    actionReceipt: {
      status: "opened",
      label: "Opened note",
      path: "Test/Test.md"
    }
  }
];

assert.equal(findLatestUserMessage(messages)?.id, "user-1");
assert.equal(formatActionReceiptStatus("saved"), "Saved");
assert.equal(formatActionReceiptStatus("needs_confirmation"), "Needs confirmation");
assert.equal(escapeMarkdownLinkText("A [source]"), "A \\[source\\]");
assert.match(serializeChatMessagesForNote(messages), /Action: Opened - Opened note/);
assert.match(serializeChatMessagesForNote(messages), /Path: Test\/Test.md/);

console.log("chatMessages tests passed");
