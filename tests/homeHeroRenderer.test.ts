import assert from "node:assert/strict";
import { renderHomeHero } from "../src/views/homeHeroRenderer";

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  createDiv(options?: { cls?: string; text?: string }): FakeElement;
  createEl(
    tagName: string,
    options?: { cls?: string; text?: string }
  ): FakeElement;
}

function createFakeElement(tagName = "div"): FakeElement {
  const element: FakeElement = {
    tagName,
    className: "",
    textContent: "",
    children: [],
    createDiv(options = {}) {
      return this.createEl("div", options);
    },
    createEl(childTagName, options = {}) {
      const child = createFakeElement(childTagName);
      child.className = options.cls ?? "";
      child.textContent = options.text ?? "";
      this.children.push(child);
      return child;
    }
  };

  return element;
}

const parentEl = createFakeElement();
let logoParentEl: FakeElement | null = null;
let logoClassName = "";

const heroEl = renderHomeHero({
  parentEl: parentEl as unknown as HTMLElement,
  greeting: "Welcome back",
  createLogo(parent, className) {
    logoParentEl = parent as unknown as FakeElement;
    logoClassName = className;
    return (parent as unknown as FakeElement).createEl("img", {
      cls: className
    }) as unknown as HTMLImageElement;
  }
}) as unknown as FakeElement;

assert.equal(heroEl.className, "contex-agent__home-hero");
assert.equal(parentEl.children[0], heroEl);

const logoWrapEl = heroEl.children[0];
assert.equal(logoWrapEl?.className, "contex-agent__home-logo-wrap");
assert.equal(logoParentEl, logoWrapEl);
assert.equal(logoClassName, "contex-agent__home-logo");
assert.equal(logoWrapEl?.children[0]?.tagName, "img");
assert.equal(logoWrapEl?.children[0]?.className, "contex-agent__home-logo");

const greetingEl = heroEl.children[1];
assert.equal(greetingEl?.className, "contex-agent__home-greeting");
assert.equal(greetingEl?.textContent, "Welcome back");

console.log("homeHeroRenderer tests passed");
