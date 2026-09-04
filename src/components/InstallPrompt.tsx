import * as React from "react";
import { Download, X } from "lucide-react";
import { useInstall } from "@/hooks/useInstall";
import { Button } from "./ui/button";
import { InstallDialog } from "./InstallDialog";

const DISMISS_KEY = "mn-install-dismissed";

/**
 * Installing matters here: a standalone window keeps recordings out of a tab
 * the OS is free to discard, and gives the recorder the whole screen.
 *
 * Rendered above the router rather than inside the app shell, so it is offered
 * on the login screen too — that is the first thing a new user sees, and the
 * moment they are most likely to want the app on their home screen.
 */
export function InstallPrompt() {
  const { canPrompt, standalone, promptInstall } = useInstall();
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISS_KEY));
    } catch {
      // Storage blocked: showing the bar again is the harmless outcome.
      return false;
    }
  });
  const [showSteps, setShowSteps] = React.useState(false);

  if (standalone || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not persisting only means it reappears next launch.
    }
    setDismissed(true);
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-3xl px-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg">
          <Download className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-sm">
            Install Meeting Notes for offline recording.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              // One tap where the browser allows it; instructions where it does not.
              if (canPrompt) {
                const accepted = await promptInstall();
                if (accepted) return;
                dismiss();
              } else {
                setShowSteps(true);
              }
            }}
          >
            Install
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label="Dismiss">
            <X />
          </Button>
        </div>
      </div>

      <InstallDialog open={showSteps} onOpenChange={setShowSteps} />
    </>
  );
}
