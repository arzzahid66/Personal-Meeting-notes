import * as React from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronRight,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { settingsApi } from "@/api/settings";
import type {
  LlmProvider,
  OutputLanguage,
  Settings,
  SettingsUpdate,
  SttProvider,
  TestKeyResult,
  TestableProvider,
} from "@/api/types";
import { useAuth } from "@/hooks/auth";
import { useSettings, useUpdateSettings } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Skeleton } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { ErrorNotice } from "@/components/ui/misc";
import { useInstall } from "@/hooks/useInstall";
import { InstallDialog } from "@/components/InstallDialog";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const KEY_FIELDS: {
  field: keyof SettingsUpdate;
  last4: keyof Settings;
  label: string;
  provider: TestableProvider | null;
  hint: string;
}[] = [
  {
    field: "openai_api_key",
    last4: "openai_key_last4",
    label: "OpenAI",
    provider: "openai",
    hint: "Used for the LLM, transcription, or both.",
  },
  {
    field: "gemini_api_key",
    last4: "gemini_key_last4",
    label: "Google Gemini",
    provider: "gemini",
    hint: "Alternative LLM provider.",
  },
  {
    field: "assemblyai_api_key",
    last4: "assemblyai_key_last4",
    label: "AssemblyAI",
    provider: "assemblyai",
    hint: "Alternative speech-to-text provider.",
  },
  {
    field: "serp_api_key",
    last4: "serp_key_last4",
    label: "SerpAPI",
    provider: null,
    hint: "Optional, for enrichment.",
  },
];

export default function SettingsScreen() {
  const { me, logout, refreshMe } = useAuth();
  const settings = useSettings();
  const update = useUpdateSettings();

  const [draft, setDraft] = React.useState<SettingsUpdate>({});
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [testing, setTesting] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, TestKeyResult>>(
    {},
  );
  const [theme, setThemeState] = React.useState<Theme>(getStoredTheme);

  const data = settings.data;
  const value = <K extends keyof Settings & keyof SettingsUpdate>(field: K) =>
    (draft[field] ?? data?.[field] ?? "") as string;

  const dirty =
    Object.keys(draft).length > 0 ||
    Object.values(keys).some((v) => v.trim().length > 0);

  async function save() {
    // A blank key input means "leave unchanged", never "clear it".
    const payload: SettingsUpdate = { ...draft };
    for (const [field, secret] of Object.entries(keys)) {
      if (secret.trim()) {
        payload[field as keyof SettingsUpdate] = secret.trim() as never;
      }
    }
    try {
      await update.mutateAsync(payload);
      setDraft({});
      setKeys({});
      // /auth/me carries the key flags the recording gate reads, so it has to
      // be re-read here or the warning banner lingers after a key is added.
      await refreshMe();
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  async function testKey(provider: TestableProvider) {
    setTesting(provider);
    try {
      const result = await settingsApi.testKey(provider);
      setTestResults((r) => ({ ...r, [provider]: result }));
    } catch (err) {
      setTestResults((r) => ({
        ...r,
        [provider]: {
          provider,
          ok: false,
          detail: err instanceof Error ? err.message : "The test failed.",
        },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />

      <div className="space-y-6">
        {/* ------------------------------------------------------ account */}
        <Card>
          <CardContent className="flex items-center justify-between gap-3 pt-4">
            <div className="min-w-0">
              <p className="truncate font-medium" dir="auto">
                {me?.name}
              </p>
              <p className="truncate text-sm text-muted-foreground">{me?.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>

        {/* -------------------------------------------------------- theme */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Appearance</h2>
          <div className="flex gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as const
            ).map(({ value: v, label, icon: Icon }) => (
              <Button
                key={v}
                variant={theme === v ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => {
                  setTheme(v);
                  setThemeState(v);
                }}
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </div>
        </section>

        {settings.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : settings.isError ? (
          <ErrorNotice message={(settings.error as Error).message} />
        ) : data ? (
          <>
            {/* ------------------------------------------------- providers */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Providers and models</h2>

              <Field label="LLM provider" htmlFor="llm-provider">
                <SimpleSelect
                  id="llm-provider"
                  value={value("llm_provider")}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, llm_provider: v as LlmProvider }))
                  }
                  options={[
                    { value: "openai", label: "OpenAI" },
                    { value: "gemini", label: "Google Gemini" },
                  ]}
                />
              </Field>

              <Field label="Speech-to-text provider" htmlFor="stt-provider">
                <SimpleSelect
                  id="stt-provider"
                  value={value("stt_provider")}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, stt_provider: v as SttProvider }))
                  }
                  options={[
                    { value: "openai", label: "OpenAI" },
                    { value: "assemblyai", label: "AssemblyAI" },
                  ]}
                />
              </Field>

              <Field label="LLM model" htmlFor="llm-model">
                <Input
                  id="llm-model"
                  value={value("llm_model")}
                  maxLength={80}
                  placeholder="gpt-4.1-mini"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, llm_model: e.target.value }))
                  }
                />
              </Field>

              <Field
                label="Transcription model"
                htmlFor="stt-model"
                hint="If your OpenAI project cannot use gpt-4o-mini-transcribe, set whisper-1 here."
              >
                <Input
                  id="stt-model"
                  value={value("transcription_model")}
                  maxLength={80}
                  placeholder="gpt-4o-mini-transcribe"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, transcription_model: e.target.value }))
                  }
                />
              </Field>

              <Field label="Default output language" htmlFor="default-language">
                <SimpleSelect
                  id="default-language"
                  value={value("default_output_language")}
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      default_output_language: v as OutputLanguage,
                    }))
                  }
                  options={[
                    { value: "en", label: "English" },
                    { value: "ur", label: "اردو — Urdu" },
                  ]}
                />
              </Field>
            </section>

            {/* ------------------------------------------------------ keys */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">API keys</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Keys are stored encrypted and never sent back to this app — only
                their last four characters. Leaving a field blank keeps the
                existing key.
              </p>

              {KEY_FIELDS.map(({ field, last4, label, provider, hint }) => {
                const existing = data[last4] as string | null;
                const result = provider ? testResults[provider] : undefined;
                return (
                  <div key={String(field)} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={String(field)}>{label}</Label>
                      {existing ? (
                        <span className="text-xs text-muted-foreground">
                          •••• {existing}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id={String(field)}
                        type="password"
                        autoComplete="off"
                        placeholder={existing ? "Leave blank to keep" : "Paste a key"}
                        value={keys[String(field)] ?? ""}
                        onChange={(e) =>
                          setKeys((k) => ({ ...k, [String(field)]: e.target.value }))
                        }
                      />
                      {provider ? (
                        <Button
                          variant="outline"
                          loading={testing === provider}
                          disabled={!existing && !keys[String(field)]}
                          onClick={() => testKey(provider)}
                        >
                          Test
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                    {result ? (
                      <p
                        className={cn(
                          "flex items-start gap-1.5 text-xs",
                          result.ok ? "text-success" : "text-destructive",
                        )}
                      >
                        {result.ok ? (
                          <Check className="mt-0.5 size-3.5 shrink-0" />
                        ) : (
                          <X className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        {/* The provider's own wording, written for end users. */}
                        <span>{result.detail}</span>
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </section>

            {/* ---------------------------------------------------- prompt */}
            <section className="space-y-3">
              <h2 className="text-sm font-medium">Generation prompt</h2>
              <Field
                label="System prompt override"
                htmlFor="prompt-override"
                hint="Advanced. Leave empty to use the assembled default below."
              >
                <Textarea
                  id="prompt-override"
                  className="min-h-24"
                  value={value("system_prompt_override")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      system_prompt_override: e.target.value,
                    }))
                  }
                  dir="auto"
                />
              </Field>

              <details className="rounded-lg border bg-card p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Effective system prompt
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {data.effective_system_prompt}
                </p>
              </details>
            </section>

            {/* --------------------------------------------------- install */}
            <InstallCard />

            {/* ---------------------------------------------------- tokens */}
            <Card>
              <CardContent className="pt-4">
                <Link
                  to="/settings/tokens"
                  className="flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">MCP tokens</p>
                    <p className="text-sm text-muted-foreground">
                      Long-lived tokens for external tooling.
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-3xl px-4 pb-2">
          <Button
            size="lg"
            className="w-full shadow-lg"
            loading={update.isPending}
            onClick={save}
          >
            Save settings
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * A permanent way in. The floating prompt can be dismissed, browsers stop
 * offering the one-tap install after a while, and iOS never offers it at all —
 * so installing has to be reachable on purpose, not only by chance.
 */
function InstallCard() {
  const { standalone, canPrompt, promptInstall } = useInstall();
  const [showSteps, setShowSteps] = React.useState(false);

  if (standalone) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-4">
          <Check className="size-5 shrink-0 text-success" />
          <div>
            <p className="font-medium">Installed</p>
            <p className="text-sm text-muted-foreground">
              You are running the installed app.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <Smartphone className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-medium">Install on this device</p>
              <p className="text-sm text-muted-foreground">
                Runs full screen and records more reliably.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (canPrompt) await promptInstall();
              else setShowSteps(true);
            }}
          >
            Install
          </Button>
        </CardContent>
      </Card>

      <InstallDialog open={showSteps} onOpenChange={setShowSteps} />
    </>
  );
}
