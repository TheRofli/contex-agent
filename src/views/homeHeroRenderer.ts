export interface HomeHeroRendererOptions {
  parentEl: HTMLElement;
  greeting: string;
  createLogo: (
    parentEl: HTMLElement,
    className: string
  ) => HTMLImageElement;
}

export function renderHomeHero(options: HomeHeroRendererOptions): HTMLElement {
  const heroEl = options.parentEl.createDiv({
    cls: "contex-agent__home-hero"
  });
  const logoWrapEl = heroEl.createDiv({
    cls: "contex-agent__home-logo-wrap"
  });

  options.createLogo(logoWrapEl, "contex-agent__home-logo");
  heroEl.createDiv({
    cls: "contex-agent__home-greeting",
    text: options.greeting
  });

  return heroEl;
}
