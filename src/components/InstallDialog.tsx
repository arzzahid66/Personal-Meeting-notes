import { Share, Smartphone } from "lucide-react";
import { INSTALL_STEPS, useInstall } from "@/hooks/useInstall";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "./ui/dialog";

/**
 * The manual install route. Every browser hides this in a different menu, and
 * iOS never offers a prompt at all, so the steps are spelled out per platform
 * rather than left to the user to hunt for.
 */
export function InstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { platform, canPrompt, promptInstall } = useInstall();
  const steps = INSTALL_STEPS[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Install on this device"
        description="There is nothing to download. The app installs straight from the browser and then opens like any other app."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
            {platform === "ios" ? (
              <Share className="size-5 shrink-0 text-primary" />
            ) : (
              <Smartphone className="size-5 shrink-0 text-primary" />
            )}
            <p className="text-sm text-muted-foreground">
              {platform === "ios"
                ? "On iPhone and iPad, only Safari can install web apps."
                : "Once installed it runs full screen, works offline, and keeps recording reliably."}
            </p>
          </div>

          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          {canPrompt ? (
            <Button
              onClick={async () => {
                await promptInstall();
                onOpenChange(false);
              }}
            >
              Install now
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
