import type { ActionReceipt, ChatMessage } from "../types";

export function trimChatTitle(content: string): string {
  const title = content
    .replace(/\s+/g, " ")
    .replace(/^\/search\s+/i, "Search: ")
    .trim();

  return title.length > 42 ? `${title.slice(0, 35).trim()}...` : title || "New chat";
}

export function findLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return messages[index];
    }
  }

  return null;
}

export function serializeChatMessagesForNote(messages: ChatMessage[]): string {
  return messages
    .filter(
      (message) =>
        message.content.trim() || message.diffPreview || message.actionReceipt
    )
    .map((message) => {
      const role = message.role === "user" ? "User" : "Assistant";
      const lines = [`## ${role}`, "", message.content.trim()];

      if (message.actionReceipt) {
        lines.push(
          "",
          `Action: ${formatActionReceiptStatus(message.actionReceipt.status)} - ${message.actionReceipt.label}`,
          message.actionReceipt.detail ? `Detail: ${message.actionReceipt.detail}` : "",
          message.actionReceipt.path ? `Path: ${message.actionReceipt.path}` : ""
        );
      }

      if (message.diffPreview) {
        lines.push(
          "",
          `Change preview: ${message.diffPreview.title}`,
          `Source: ${message.diffPreview.sourcePath}`,
          `Status: ${message.diffPreview.status}`,
          "",
          "Original:",
          "```text",
          message.diffPreview.original,
          "```",
          "",
          "Suggested:",
          "```text",
          message.diffPreview.suggested,
          "```"
        );
      }

      if (message.sources?.length) {
        lines.push(
          "",
          "Sources:",
          ...message.sources.map(
            (source) => `- ${source.path} (score ${source.score})`
          )
        );
      }

      if (message.semanticVaultQuery) {
        lines.push("", `Semantic vault query: ${message.semanticVaultQuery}`);
      }

      if (message.vaultSearchResults?.length) {
        lines.push(
          "",
          "Search results:",
          ...message.vaultSearchResults.map(
            (result) => `- ${result.path} (score ${result.score})`
          )
        );
      }

      if (message.webResearchResults?.length) {
        lines.push(
          "",
          "Web research sources:",
          message.webSearchQuery &&
            message.webSearchQuery !== message.webResearchQuery
            ? `Search query: ${message.webSearchQuery}`
            : "",
          ...message.webResearchResults.map(
            (result) => `- [${escapeMarkdownLinkText(result.title)}](${result.url})`
          )
        );
      }

      return lines.filter((line) => line !== undefined).join("\n");
    })
    .join("\n\n---\n\n");
}

export function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[[\]]/g, "\\$&");
}

export function formatActionReceiptStatus(status: ActionReceipt["status"]): string {
  if (status === "done") {
    return "Done";
  }

  if (status === "preview") {
    return "Preview";
  }

  if (status === "opened") {
    return "Opened";
  }

  if (status === "saved") {
    return "Saved";
  }

  if (status === "reverted") {
    return "Reverted";
  }

  if (status === "rejected") {
    return "Rejected";
  }

  if (status === "needs_confirmation") {
    return "Needs confirmation";
  }

  return "Failed";
}
