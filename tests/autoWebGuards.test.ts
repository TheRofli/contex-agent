import assert from "node:assert/strict";
import { isVaultLocalDescriptionRequest } from "../src/chat/autoWebGuards";

assert.equal(
  isVaultLocalDescriptionRequest(
    "Можешь описать быстрый файл, который сейчас у меня открыт? О чем он вообще?"
  ),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest(
    "Опиши текущую заметку и проверь в интернете свежие данные"
  ),
  false
);

assert.equal(isVaultLocalDescriptionRequest("latest local LLM releases"), false);

assert.equal(isVaultLocalDescriptionRequest("What is this active note about?"), true);

assert.equal(isVaultLocalDescriptionRequest("What is in the current note?"), true);

assert.equal(isVaultLocalDescriptionRequest("What's in the current note?"), true);

assert.equal(isVaultLocalDescriptionRequest("Tell me about the current note"), true);

assert.equal(
  isVaultLocalDescriptionRequest("What is in the current note about internet architecture?"),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note about online learning"),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note and use Web Components examples"),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest("What is in the current note? Search the internet too."),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note using online sources."),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe this file with internet research."),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Explain the opened file and use my vault notes."),
  true
);

assert.equal(isVaultLocalDescriptionRequest("Explain the opened note."), true);

assert.equal(isVaultLocalDescriptionRequest("Describe the open note."), true);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note about latest LLM tools"),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note using web sources"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe the current note with web research"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize the current note using web search"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe this file with web search"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe the current note and use the web"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Summarize this note using the web"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe this file and use web sources"),
  false
);

assert.equal(
  isVaultLocalDescriptionRequest("Describe the open note about Web Components"),
  true
);

assert.equal(isVaultLocalDescriptionRequest("Explain this file path"), true);

assert.equal(isVaultLocalDescriptionRequest("Find current LLM notes in my vault."), true);

assert.equal(isVaultLocalDescriptionRequest("Search current LLM notes in my vault"), true);

assert.equal(isVaultLocalDescriptionRequest("Can you search vault for current LLM?"), true);

assert.equal(isVaultLocalDescriptionRequest("Find current note-taking apps"), false);

assert.equal(isVaultLocalDescriptionRequest("Find notes about latest LLM tools"), true);

assert.equal(isVaultLocalDescriptionRequest("Search notes about latest LLM tools"), true);

assert.equal(isVaultLocalDescriptionRequest("Find files about latest LLM tools"), true);

assert.equal(
  isVaultLocalDescriptionRequest("Find notes about latest LLM tools using web search"),
  false
);

assert.equal(isVaultLocalDescriptionRequest("Search files about current LLM notes"), true);

assert.equal(isVaultLocalDescriptionRequest("Search files about current LLM"), true);

assert.equal(
  isVaultLocalDescriptionRequest("Describe this file about latest LLM tools"),
  true
);

assert.equal(isVaultLocalDescriptionRequest("Describe file about latest LLM tools"), false);

assert.equal(isVaultLocalDescriptionRequest("Найди заметки про актуальные LLM"), true);

assert.equal(isVaultLocalDescriptionRequest("поищи заметки про актуальные LLM"), true);

assert.equal(isVaultLocalDescriptionRequest("поиск по vault про актуальные LLM"), true);

assert.equal(isVaultLocalDescriptionRequest("поищи в интернете актуальные LLM"), false);

assert.equal(isVaultLocalDescriptionRequest("поиск в интернете актуальные LLM"), false);

assert.equal(isVaultLocalDescriptionRequest("Найди файлы про актуальные LLM"), true);

assert.equal(isVaultLocalDescriptionRequest("Покажи путь к заметке про LLM"), true);

assert.equal(
  isVaultLocalDescriptionRequest("Find qore systems strategy in my vault"),
  true
);

assert.equal(
  isVaultLocalDescriptionRequest("Search the web for qore systems strategy"),
  false
);

console.log("autoWebGuards tests passed");
