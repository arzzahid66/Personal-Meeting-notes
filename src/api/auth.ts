import { apiFetch } from "./client";
import type { Me, SignupResponse, TokenPair } from "./types";

export const authApi = {
  /** Signup deliberately returns no tokens — call login straight afterwards. */
  signup(body: { name: string; email: string; password: string }) {
    return apiFetch<SignupResponse>("/auth/signup", {
      method: "POST",
      body,
      anonymous: true,
    });
  },

  login(body: { email: string; password: string }) {
    return apiFetch<TokenPair>("/auth/login", {
      method: "POST",
      body,
      anonymous: true,
    });
  },

  me() {
    return apiFetch<Me>("/auth/me");
  },
};
