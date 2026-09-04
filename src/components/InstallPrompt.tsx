import * as React from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "./ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "mn-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Installing matters here: a standalone window keeps recordings out of a tab
 * that iOS is free to discard, and gives the recorder the full screen.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHint, setShowIosHint] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // Storage blocked: showing the prompt again is the harmless outcome.
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt, so it gets the manual instruction.
    if (isIos()) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignored: the prompt simply reappears next launch.
    }
    setDeferred(null);
    setShowIosHint(false);
  };

  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-3xl px-4">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg">
        <Download className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          {deferred ? (
            <p>Install Meeting Notes for offline recording.</p>
          ) : (
            <p className="flex flex-wrap items-center gap-1">
              Install: tap <Share className="inline size-4" /> Share, then
              <span className="font-medium">Add to Home Screen</span>.
            </p>
          )}
        </div>
        {deferred ? (
          <Button
            size="sm"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              dismiss();
            }}
          >
            Install
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss">
          <X />
        </Button>
      </div>
    </div>
  );
}
