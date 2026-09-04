import { apiFetch } from "./client";
import type {
  McpToken,
  McpTokenCreated,
  Settings,
  SettingsUpdate,
  TestKeyResult,
  TestableProvider,
  UUID,
} from "./types";

export const settingsApi = {
  get() {
    return apiFetch<Settings>("/settings");
  },

  update(body: SettingsUpdate) {
    return apiFetch<Settings>("/settings", { method: "PUT", body });
  },

  testKey(provider: TestableProvider) {
    return apiFetch<TestKeyResult>("/settings/test-key", {
      method: "POST",
      body: { provider },
    });
  },

  promptPreview(outputLanguage: string) {
    return apiFetch<unknown>("/settings/prompt-preview", {
      query: { output_language: outputLanguage },
    });
  },

  listTokens() {
    return apiFetch<McpToken[]>("/settings/tokens");
  },

  /** The plaintext token comes back exactly once. */
  createToken(name: string) {
    return apiFetch<McpTokenCreated>("/settings/tokens", {
      method: "POST",
      body: { name },
    });
  },

  revokeToken(id: UUID) {
    return apiFetch<unknown>(`/settings/tokens/${id}`, { method: "DELETE" });
  },
};
