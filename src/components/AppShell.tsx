import * as React from "react";
import {
  CalendarDays,
  CheckSquare,
  FolderKanban,
  KeyRound,
  Mic,
  Settings as SettingsIcon,
  WifiOff,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/auth";
import { useOnline } from "@/hooks/useOnline";
import { cn } from "@/lib/utils";
import { RecoveryPrompt } from "./RecoveryPrompt";

const NAV = [
  { to: "/meetings", label: "Meetings", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/record", label: "Record", icon: Mic, primary: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell() {
  const { keysReady, me } = useAuth();
  const online = useOnline();
  const location = useLocation();

  // Scroll to top on navigation — a PWA has no browser chrome to do it for us.
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-1.5 text-xs font-medium text-warning">
          <WifiOff className="size-3.5" />
          Offline — recordings are saved on this device until you reconnect.
        </div>
      ) : null}

      {me && !keysReady ? (
        <NavLink
          to="/settings"
          className="flex items-center gap-2 bg-destructive/12 px-4 py-2 text-xs font-medium text-destructive"
        >
          <KeyRound className="size-3.5 shrink-0" />
          <span>
            Add a provider API key before recording — transcription will fail
            without one. Open Settings.
          </span>
        </NavLink>
      ) : null}

      <RecoveryPrompt />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-safe">
        <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2 pt-1">
          {NAV.map(({ to, label, icon: Icon, ...rest }) => {
            const primary = "primary" in rest && rest.primary;
            return (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "flex items-center justify-center rounded-full transition-colors",
                          primary
                            ? "-mt-4 size-12 bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                            : "size-7",
                          !primary && isActive ? "bg-primary/12" : "",
                        )}
                      >
                        <Icon className={primary ? "size-5" : "size-[18px]"} />
                      </span>
                      <span className={primary ? "mt-0.5" : ""}>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Page title row used by every screen, so headings stay consistent. */
export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  back?: React.ReactNode;
}) {
  return (
    <header className="mb-4 space-y-1">
      {back}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight" dir="auto">
            {title}
          </h1>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
