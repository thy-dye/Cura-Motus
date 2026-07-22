import { useState } from "react";
import "./AuthPage.css";
import logo from "./assets/logo.png";

export default function AuthPage({ onAuthSuccess, theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const body =
        mode === "signin"
          ? { email: form.email, password: form.password }
          : {
              first_name: form.firstName,
              last_name: form.lastName,
              email: form.email,
              password: form.password,
            };
      const path = mode === "signin" ? "login" : "create";

      const res = await fetch(`/backend/account/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.Error || data?.error || "Something went wrong. Please try again.");
        return;
      }

      const user =
        mode === "signin"
          ? { id: data?.[0]?.id, firstName: data?.[0]?.FirstName, email: form.email }
          : { id: data?.id, firstName: form.firstName, email: form.email };

      if (onAuthSuccess) onAuthSuccess(user);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setError("");
    setMode(nextMode);
  };

  return (
    <div className="auth-page">
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="auth-theme-toggle"
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 0.75V2.5M8 13.5V15.25M15.25 8H13.5M2.5 8H0.75M13.06 2.94L11.83 4.17M4.17 11.83L2.94 13.06M13.06 13.06L11.83 11.83M4.17 4.17L2.94 2.94"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M14 9.3A6 6 0 1 1 6.7 2a4.7 4.7 0 0 0 7.3 7.3Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}

      <div className="auth-content">
        <img src={logo} alt="Cura Motus" className="auth-logo" />
        <h1 className="auth-wordmark">Cura Motus</h1>
        <p className="auth-tagline">Guided recovery, one movement at a time</p>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "signin"}
              className={`auth-tab ${mode === "signin" ? "active" : ""}`}
              onClick={() => switchMode("signin")}
              type="button"
            >
              Sign In
            </button>
            <button
              role="tab"
              aria-selected={mode === "signup"}
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => switchMode("signup")}
              type="button"
            >
              Create Account
            </button>
            <div
              className="auth-tab-indicator"
              style={{
                transform:
                  mode === "signin" ? "translateX(0%)" : "translateX(100%)",
              }}
            />
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            key={mode}
          >
            {mode === "signup" && (
              <div className="auth-row">
                <label className="auth-field">
                  First Name
                  <input
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleChange}
                    placeholder="Jordan"
                    required
                  />
                </label>
                <label className="auth-field">
                  Last Name
                  <input
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleChange}
                    placeholder="Rivera"
                    required
                  />
                </label>
              </div>
            )}

            <label className="auth-field">
              Email
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="auth-field">
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting
                ? "Please wait…"
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}