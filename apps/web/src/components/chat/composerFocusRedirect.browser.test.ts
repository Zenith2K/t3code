import { afterEach, describe, expect, it } from "vite-plus/test";

import { shouldTypeToFocusComposer } from "./composerFocusRedirect";

// composedPath() is only populated while the event is dispatching, so decide
// inside a window capture listener the way the chat view does.
function typeOn(target: Element, key: string): boolean {
  let redirected = false;
  const listener = (event: KeyboardEvent) => {
    redirected = shouldTypeToFocusComposer(event);
  };
  window.addEventListener("keydown", listener, { capture: true });
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  window.removeEventListener("keydown", listener, { capture: true });
  return redirected;
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
  it("sends letters typed on the chat to the composer", () => {
    const chat = document.createElement("div");
    document.body.append(chat);

    expect(typeOn(chat, "a")).toBe(true);
  });

  it("keeps letters typed on the device screen on the device", () => {
    const deviceScreen = document.createElement("div");
    deviceScreen.setAttribute("role", "application");
    deviceScreen.tabIndex = 0;
    document.body.append(deviceScreen);

    expect(typeOn(deviceScreen, "a")).toBe(false);
  });

  it("leaves an open surface launcher's letters to the launcher", () => {
    const launcher = mountLauncher("BTFD");

    expect(typeOn(launcher, "f")).toBe(false);
    expect(typeOn(document.body, "B")).toBe(false);
    expect(typeOn(launcher, "x")).toBe(true);
  });

  it("types into the composer once the launcher's panel is closing", () => {
    const panel = document.createElement("div");
    panel.inert = true;
    document.body.append(panel);
    const launcher = mountLauncher("F");
    panel.append(launcher);

    expect(typeOn(document.body, "f")).toBe(true);
  });
});
