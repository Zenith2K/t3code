import { describe, expect, it } from "vite-plus/test";

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

function attach(element: Element): Disposable {
  document.body.append(element);
  return { [Symbol.dispose]: () => element.remove() };
}

function launcherFor(keys: string): HTMLElement {
  const launcher = document.createElement("div");
  launcher.tabIndex = 0;
  launcher.dataset.surfaceLauncherKeys = keys;
  return launcher;
}

describe("shouldTypeToFocusComposer", () => {
  it("sends letters typed on the chat to the composer", () => {
    const chat = document.createElement("div");
    using _chat = attach(chat);

    expect(typeOn(chat, "a")).toBe(true);
  });

  it("keeps letters typed on the device screen on the device", () => {
    const deviceScreen = document.createElement("div");
    deviceScreen.setAttribute("role", "application");
    deviceScreen.tabIndex = 0;
    using _deviceScreen = attach(deviceScreen);

    expect(typeOn(deviceScreen, "a")).toBe(false);
  });

  it("leaves an open surface launcher's letters to the launcher", () => {
    const launcher = launcherFor("BTFD");
    using _launcher = attach(launcher);

    expect(typeOn(launcher, "f")).toBe(false);
    expect(typeOn(document.body, "B")).toBe(false);
    expect(typeOn(launcher, "x")).toBe(true);
  });

  it("types into the composer once the launcher's panel is closing", () => {
    const panel = document.createElement("div");
    panel.inert = true;
    panel.append(launcherFor("F"));
    using _panel = attach(panel);

    expect(typeOn(document.body, "f")).toBe(true);
  });
});
