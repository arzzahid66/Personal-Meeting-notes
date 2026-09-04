import * as React from "react";

/**
 * Installation state for the PWA.
 *
 * `beforeinstallprompt` fires once, early — often before React has mounted — so
 * the event is captured at module scope and replayed to whoever asks later.
 * Without that, a component mounting a moment too late never sees it and the
 * install offer silently disappears.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallPlatform = "ios" | "android" | "desktop";

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

export function useInstall() {
  const snapshot = React.useSyncExternalStore(
    subscribe,
    () => (installed ? "installed" : deferred ? "ready" : "none"),
    () => "none" as const,
  );

  const promptInstall = React.useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === "accepted";
  }, []);

  return {
    /** True when the browser has offered a one-tap install. */
    canPrompt: snapshot === "ready",
    /** True once running from the home screen, so nothing needs offering. */
    standalone: isStandalone() || snapshot === "installed",
    platform: installPlatform(),
    promptInstall,
  };
}

/** The manual route, for browsers that never fire the install event. */
export const INSTALL_STEPS: Record<InstallPlatform, string[]> = {
  ios: [
    "Open this page in Safari (Chrome on iPhone cannot install apps).",
    "Tap the Share button at the bottom of the screen.",
    "Scroll down and tap “Add to Home Screen”.",
    "Tap Add. The icon appears on your home screen.",
  ],
  android: [
    "Open this page in Chrome.",
    "Tap the ⋮ menu at the top right.",
    "Tap “Install app”, or “Add to Home screen”.",
    "Confirm. The icon appears in your app drawer.",
  ],
  desktop: [
    "Open this page in Chrome, Edge or Brave.",
    "Click the install icon at the right of the address bar.",
    "Alternatively, open the ⋮ menu and choose “Install…”.",
  ],
};
