import { afterEach, describe, expect, it } from "vite-plus/test";

import { shouldTypeToFocusComposer } from "./composerFocusRedirect";

function keyFrom(target: HTMLElement, key: string): KeyboardEvent {
  let observed: KeyboardEvent | null = null;
  target.addEventListener("keydown", (event) => (observed = event), { once: true });
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  return observed!;
}

function mountLauncher(keys: string): HTMLElement {
  const launcher = document.createElement("div");
  launcher.tabIndex = 0;
  launcher.dataset.surfaceLauncherKeys = keys;
  document.body.append(launcher);
  return launcher;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("shouldTypeToFocusComposer", () => {
  it("leaves an open surface launcher's letters to the launcher", () => {
    const launcher = mountLauncher("BTFD");

    expect(shouldTypeToFocusComposer(keyFrom(launcher, "f"))).toBe(false);
    expect(shouldTypeToFocusComposer(keyFrom(document.body, "B"))).toBe(false);
    expect(shouldTypeToFocusComposer(keyFrom(launcher, "x"))).toBe(true);
  });

  it("types into the composer once the launcher's panel is closing", () => {
    const panel = document.createElement("div");
    panel.inert = true;
    document.body.append(panel);
    const launcher = mountLauncher("F");
    panel.append(launcher);

    expect(shouldTypeToFocusComposer(keyFrom(document.body, "f"))).toBe(true);
  });
});
