"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getApiUrl } from "@/utils/api";
import { isAuthDisabled } from "@/utils/auth";
import { formatFastApiDetail, UNAUTHORIZED_DETAIL } from "@/utils/authErrors";
import {
  PRESENTON_SPLASH_MIN_DURATION_MS,
  PresentonSplashLoader,
} from "@/components/ui/presenton-splash-loader";
import { notify } from "@/components/ui/sonner";
import { sanitizeAnalyticsError } from "@/utils/analytics";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  role?: "admin" | "user" | null;
};

type AuthMode = "setup" | "login" | "register";

const initialStatus: AuthStatus = {
  configured: false,
  authenticated: false,
  username: null,
  role: null,
};

/** Personal-brand auth palette — warm editorial, no purple glow */
const AUTH_THEME = {
  bg: "#FAF9F7",
  card: "#FFFFFF",
  cardBorder: "#E8E4DF",
  ink: "#1A1A18",
  muted: "#6B6560",
  accent: "#C45C3E",
  accentHover: "#A84D33",
  accentSoft: "#F5EBE8",
  inputBorder: "#D9D4CE",
  inputFocus: "#C45C3E",
} as const;

function authFlow(mode: AuthMode): string {
  if (mode === "setup") return "setup";
  if (mode === "register") return "register";
  return "sign_in";
}

export default function AuthGate() {
  const [status, setStatus] = useState<AuthStatus>(initialStatus);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasMetSplashDuration, setHasMetSplashDuration] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [configuredView, setConfiguredView] = useState<"login" | "register">(
    "login"
  );

  const authMode: AuthMode = useMemo(() => {
    if (!status.configured) return "setup";
    return configuredView;
  }, [configuredView, status.configured]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHasMetSplashDuration(true);
    }, PRESENTON_SPLASH_MIN_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isAuthDisabled()) {
      trackEvent(MixpanelEvent.Auth_Status_Checked, {
        configured: true,
        authenticated: true,
        auth_disabled: true,
      });
      setStatus({
        configured: true,
        authenticated: true,
        username: "local",
        role: "admin",
      });
      setIsLoading(false);
      return;
    }

    void refreshStatus();
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      isLoading ||
      !status.authenticated ||
      isRedirecting
    ) {
      return;
    }

    setIsRedirecting(true);
    window.location.replace("/");
  }, [isLoading, isRedirecting, status.authenticated]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") === "unauthorized") {
      if (status.configured && !status.authenticated) {
        trackEvent(MixpanelEvent.Auth_Unauthorized_Redirect, {
          configured: true,
        });
        notify.error("Unauthorized", "Sign in to view this page.", {
          id: "auth-unauthorized-redirect",
          duration: 5000,
        });
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isLoading, status.authenticated, status.configured]);

  const refreshStatus = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/v1/auth/status"), {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Could not load login state");
      }

      const data = (await response.json()) as AuthStatus;
      trackEvent(MixpanelEvent.Auth_Status_Checked, {
        configured: Boolean(data.configured),
        authenticated: Boolean(data.authenticated),
        auth_disabled: false,
        role: data.role ?? null,
      });
      setStatus({
        configured: Boolean(data.configured),
        authenticated: Boolean(data.authenticated),
        username: data.username ?? null,
        role: data.role ?? null,
      });
    } catch (fetchError) {
      console.error(fetchError);
      trackEvent(MixpanelEvent.Auth_Status_Checked, {
        configured: false,
        authenticated: false,
        auth_disabled: false,
        error_message: sanitizeAnalyticsError(
          fetchError,
          "Could not load login state"
        ),
      });
      notify.error(
        "Could not load login",
        "We could not connect to the login service. Please refresh and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (
      isLoading ||
      isRedirecting ||
      status.authenticated ||
      !hasMetSplashDuration
    ) {
      return;
    }

    trackEvent(MixpanelEvent.Auth_Gate_Viewed, {
      flow: authFlow(authMode),
    });
  }, [
    authMode,
    hasMetSplashDuration,
    isLoading,
    isRedirecting,
    status.authenticated,
  ]);

  const switchConfiguredView = (next: "login" | "register") => {
    setConfiguredView(next);
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanedUsername = username.trim();
    const flow = authFlow(authMode);
    const isSetupMode = authMode === "setup";
    const isRegisterMode = authMode === "register";

    if (cleanedUsername.length < 3) {
      trackEvent(MixpanelEvent.Auth_Validation_Failed, {
        flow,
        reason: "username_too_short",
      });
      notify.warning(
        "Username too short",
        "Your username must be at least 3 characters."
      );
      return;
    }

    const minimumPasswordLength = isSetupMode || isRegisterMode ? 8 : 6;
    if (password.length < minimumPasswordLength) {
      trackEvent(MixpanelEvent.Auth_Validation_Failed, {
        flow,
        reason: "password_too_short",
      });
      notify.warning(
        "Password too short",
        `Your password must be at least ${minimumPasswordLength} characters.`
      );
      return;
    }

    if ((isSetupMode || isRegisterMode) && password !== confirmPassword) {
      trackEvent(MixpanelEvent.Auth_Validation_Failed, {
        flow,
        reason: "passwords_do_not_match",
      });
      notify.warning(
        "Passwords do not match",
        "Make sure both password fields match before continuing."
      );
      return;
    }

    setIsSubmitting(true);

    const startedEvent = isSetupMode
      ? MixpanelEvent.Auth_Setup_Started
      : isRegisterMode
        ? MixpanelEvent.Auth_Register_Started
        : MixpanelEvent.Auth_SignIn_Started;
    trackEvent(startedEvent, {
      username_length: cleanedUsername.length,
    });

    const endpoint = isSetupMode
      ? "/api/v1/auth/setup"
      : isRegisterMode
        ? "/api/v1/auth/register"
        : "/api/v1/auth/login";

    try {
      const response = await fetch(getApiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: cleanedUsername,
          password,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const detail = formatFastApiDetail(payload?.detail);
        const failedEvent = isSetupMode
          ? MixpanelEvent.Auth_Setup_Failed
          : isRegisterMode
            ? MixpanelEvent.Auth_Register_Failed
            : MixpanelEvent.Auth_SignIn_Failed;
        trackEvent(failedEvent, {
          status_code: response.status,
          error_message: sanitizeAnalyticsError(
            detail,
            isSetupMode
              ? "Could not create account"
              : isRegisterMode
                ? "Could not create account"
                : "Sign-in failed"
          ),
        });

        if (response.status === 401) {
          notify.error(
            "Sign-in failed",
            detail === UNAUTHORIZED_DETAIL
              ? "The username or password is incorrect. Please try again."
              : detail
          );
        } else if (response.status === 409) {
          notify.error(
            "Username unavailable",
            detail || "That username is already taken. Try another."
          );
        } else if (response.status === 428) {
          notify.error(
            "Setup required",
            detail || "An admin must finish setup before new accounts can be created."
          );
        } else if (response.status === 429) {
          notify.error(
            "Too many attempts",
            detail || "Please wait a moment and try again."
          );
        } else {
          notify.error(
            isSetupMode || isRegisterMode
              ? "Could not create account"
              : "Sign-in failed",
            detail || "Something went wrong. Please try again."
          );
        }
        return;
      }

      if (isSetupMode) {
        trackEvent(MixpanelEvent.Auth_Setup_Completed, {
          username_length: cleanedUsername.length,
        });
        setStatus({
          configured: true,
          authenticated: false,
          username: (payload as AuthStatus).username ?? cleanedUsername,
          role: (payload as AuthStatus).role ?? "admin",
        });
        setConfiguredView("login");
        setPassword("");
        setConfirmPassword("");
        notify.success(
          "Admin account created",
          "Sign in with your new username and password to continue.",
          { duration: 6000 }
        );
        return;
      }

      setStatus({
        configured: Boolean((payload as AuthStatus).configured),
        authenticated: Boolean((payload as AuthStatus).authenticated),
        username: (payload as AuthStatus).username ?? cleanedUsername,
        role: (payload as AuthStatus).role ?? null,
      });

      if (isRegisterMode) {
        trackEvent(MixpanelEvent.Auth_Register_Completed, {
          username_length: cleanedUsername.length,
          role: (payload as AuthStatus).role ?? null,
        });
        notify.success(
          "Account created",
          "Welcome. Loading your workspace."
        );
      } else {
        trackEvent(MixpanelEvent.Auth_SignIn_Completed, {
          username_length: cleanedUsername.length,
          role: (payload as AuthStatus).role ?? null,
        });
        notify.success(
          "Signed in",
          "Welcome back. Loading your workspace."
        );
      }

      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      console.error(submitError);
      const failedEvent = isSetupMode
        ? MixpanelEvent.Auth_Setup_Failed
        : isRegisterMode
          ? MixpanelEvent.Auth_Register_Failed
          : MixpanelEvent.Auth_SignIn_Failed;
      trackEvent(failedEvent, {
        status_code: null,
        error_message: sanitizeAnalyticsError(
          submitError,
          isSetupMode || isRegisterMode
            ? "Could not create account"
            : "Login unavailable"
        ),
      });
      notify.error(
        isSetupMode || isRegisterMode ? "Registration unavailable" : "Login unavailable",
        "The login service is unavailable right now. Please try again in a moment."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const headline =
    authMode === "setup"
      ? "Create your admin login"
      : authMode === "register"
        ? "Create your account"
        : "Sign in";

  const description =
    authMode === "setup"
      ? "One-time setup for this deployment. You will use the same username and password on future visits."
      : authMode === "register"
        ? "Choose a username and password to start creating presentations."
        : "Welcome back. Enter your credentials to open the app.";

  const submitLabel =
    authMode === "setup"
      ? "Create admin"
      : authMode === "register"
        ? "Create account"
        : "Sign in";

  const submittingLabel =
    authMode === "setup"
      ? "Saving credentials…"
      : authMode === "register"
        ? "Creating account…"
        : "Signing in…";

  if (
    isLoading ||
    isRedirecting ||
    status.authenticated ||
    !hasMetSplashDuration
  ) {
    return <PresentonSplashLoader message="Preparing your workspace..." />;
  }

  return (
    <main
      className="auth-theme relative flex min-h-screen items-center justify-center overflow-hidden p-6 font-syne"
      style={
        {
          "--auth-bg": AUTH_THEME.bg,
          "--auth-card": AUTH_THEME.card,
          "--auth-card-border": AUTH_THEME.cardBorder,
          "--auth-ink": AUTH_THEME.ink,
          "--auth-muted": AUTH_THEME.muted,
          "--auth-accent": AUTH_THEME.accent,
          "--auth-accent-hover": AUTH_THEME.accentHover,
          "--auth-accent-soft": AUTH_THEME.accentSoft,
          "--auth-input-border": AUTH_THEME.inputBorder,
          "--auth-input-focus": AUTH_THEME.inputFocus,
          backgroundColor: "var(--auth-bg)",
        } as CSSProperties
      }
    >
      <section
        className="relative z-10 w-full max-w-md rounded-2xl border p-7 shadow-sm sm:p-9"
        style={{
          borderColor: "var(--auth-card-border)",
          backgroundColor: "var(--auth-card)",
        }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg p-2.5"
              style={{ backgroundColor: "var(--auth-accent-soft)" }}
            >
              <Image
                src="/logo-with-bg.png"
                alt=""
                width={161}
                height={166}
                className="h-9 w-auto object-contain"
              />
            </div>
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--auth-accent)" }}
              >
                Presentations
              </p>
              <h1
                className="mt-1 font-unbounded text-xl font-normal leading-tight tracking-[-0.03em] sm:text-[22px]"
                style={{ color: "var(--auth-ink)" }}
              >
                {headline}
              </h1>
            </div>
          </div>
        </div>

        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--auth-muted)" }}
        >
          {description}
        </p>

        {status.configured ? (
          <div
            className="mt-6 flex rounded-lg border p-1"
            style={{ borderColor: "var(--auth-card-border)" }}
            role="tablist"
            aria-label="Authentication mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "login"}
              onClick={() => switchConfiguredView("login")}
              disabled={isSubmitting}
              className="flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor:
                  authMode === "login" ? "var(--auth-accent-soft)" : "transparent",
                color:
                  authMode === "login" ? "var(--auth-accent)" : "var(--auth-muted)",
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "register"}
              onClick={() => switchConfiguredView("register")}
              disabled={isSubmitting}
              className="flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor:
                  authMode === "register"
                    ? "var(--auth-accent-soft)"
                    : "transparent",
                color:
                  authMode === "register"
                    ? "var(--auth-accent)"
                    : "var(--auth-muted)",
              }}
            >
              Create account
            </button>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="username"
              className="block text-sm font-medium"
              style={{ color: "var(--auth-ink)" }}
            >
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value.replace(/\s/g, ""))
              }
              placeholder="Username"
              minLength={3}
              maxLength={128}
              pattern="\S+"
              title="Username cannot contain spaces"
              required
              spellCheck={false}
              className="h-12 w-full rounded-lg border bg-white px-4 text-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--auth-input-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--auth-input-focus)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: "var(--auth-input-border)",
                color: "var(--auth-ink)",
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium"
              style={{ color: "var(--auth-ink)" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                authMode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                authMode === "login"
                  ? "Enter your password"
                  : "At least 8 characters"
              }
              minLength={authMode === "login" ? 6 : 8}
              maxLength={128}
              required
              className="h-12 w-full rounded-lg border bg-white px-4 text-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--auth-input-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--auth-input-focus)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: "var(--auth-input-border)",
                color: "var(--auth-ink)",
              }}
              disabled={isSubmitting}
            />
          </div>

          {authMode === "setup" || authMode === "register" ? (
            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium"
                style={{ color: "var(--auth-ink)" }}
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                minLength={8}
                maxLength={128}
                required
                className="h-12 w-full rounded-lg border bg-white px-4 text-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[var(--auth-input-focus)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--auth-input-focus)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  borderColor: "var(--auth-input-border)",
                  color: "var(--auth-ink)",
                }}
                disabled={isSubmitting}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full px-5 py-3 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: "var(--auth-accent)",
            }}
            onMouseEnter={(event) => {
              if (!isSubmitting) {
                event.currentTarget.style.backgroundColor =
                  "var(--auth-accent-hover)";
              }
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = "var(--auth-accent)";
            }}
          >
            {isSubmitting ? submittingLabel : submitLabel}
          </button>
        </form>
      </section>
    </main>
  );
}
