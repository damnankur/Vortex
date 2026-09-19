"use client";
import React, { useState } from "react";
import classes from "./AuthGateway.module.css";

interface AuthGatewayProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, inviteCode?: string) => Promise<void>;
}

export const AuthGateway: React.FC<AuthGatewayProps> = ({
  theme,
  onToggleTheme,
  onLogin,
  onRegister,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverInviteCode, setServerInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || submitting) return;

    setSubmitting(true);
    setAuthError(null);

    try {
      if (authMode === "login") {
        await onLogin(username.trim(), password);
      } else {
        await onRegister(
          username.trim(),
          password,
          serverInviteCode.trim() || undefined
        );
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.usernameModal} data-theme={theme}>
      <div className={classes.windowFrame}>
        <div className={classes.windowTitleBar}>
          <div className={classes.windowTitle}>
            <span className={classes.windowPrompt}>&gt;_</span> SYS://AUTH_GATEWAY
          </div>
          <div className={classes.windowControls}>
            <button
              type="button"
              className={classes.windowBtn}
              onClick={onToggleTheme}
              title="Toggle Theme"
              style={{ cursor: "pointer", width: "auto", padding: "0 6px" }}
            >
              {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
            </button>
            <span className={classes.windowBtn} aria-hidden="true">—</span>
            <span className={classes.windowBtn} aria-hidden="true">□</span>
            <span className={`${classes.windowBtn} ${classes.windowBtnClose}`} aria-hidden="true">✕</span>
          </div>
        </div>

        <div className={classes.usernameCard}>
          <div className={classes.usernameBrand}>
            <div className={classes.logoContainer}>
              <img
                src="/vortex-logo.png"
                alt="Vortex logo"
                width={52}
                height={52}
                className={classes.usernameLogo}
              />
            </div>
            <h1 className={classes.usernameTitle}>VORTEX // PRIVATE</h1>
            <div className={classes.securityBadge}>FRIEND-GROUP AUTHENTICATED GATEWAY</div>
          </div>

          <div className={classes.authTabs}>
            <button
              type="button"
              className={`${classes.authTab} ${authMode === "login" ? classes.authTabActive : ""}`}
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
            >
              [ LOGIN ]
            </button>
            <button
              type="button"
              className={`${classes.authTab} ${authMode === "register" ? classes.authTabActive : ""}`}
              onClick={() => {
                setAuthMode("register");
                setAuthError(null);
              }}
            >
              [ REGISTER ]
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <label className={classes.inputLabel} htmlFor="operator-handle">
              OPERATOR_HANDLE // [3-20 CHARS]
            </label>
            <input
              id="operator-handle"
              className={classes.usernameInput}
              placeholder="e.g. cyber_operator"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              maxLength={20}
              required
              aria-label="Operator handle"
            />

            <label className={classes.inputLabel} htmlFor="operator-password">
              PASSPHRASE // [MIN 6 CHARS]
            </label>
            <div className={classes.passwordWrapper}>
              <input
                id="operator-password"
                type={showPassword ? "text" : "password"}
                className={classes.usernameInput}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                aria-label="Passphrase"
              />
              <button
                type="button"
                className={classes.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? "[ HIDE ]" : "[ SHOW ]"}
              </button>
            </div>

            {authMode === "register" && (
              <>
                <label className={classes.inputLabel} htmlFor="server-invite">
                  SERVER_INVITE_PASSKEY // [FRIEND GROUP CODE]
                </label>
                <input
                  id="server-invite"
                  type="text"
                  className={classes.usernameInput}
                  placeholder="e.g. VX-4B9X (Optional)"
                  value={serverInviteCode}
                  onChange={(e) => setServerInviteCode(e.target.value.toUpperCase())}
                  maxLength={15}
                  aria-label="Server invite code"
                />
              </>
            )}

            {authError && (
              <div className={classes.errorBanner} role="alert">
                <span>[!]</span> {authError}
              </div>
            )}

            <button
              type="submit"
              className={classes.usernameBtn}
              disabled={submitting || !username.trim() || !password}
            >
              {submitting
                ? authMode === "login"
                  ? "AUTHENTICATING..."
                  : "REGISTERING..."
                : authMode === "login"
                ? "AUTHENTICATE ↵"
                : "ESTABLISH IDENTITY ↵"}
            </button>
          </form>

          <div className={classes.terminalFooter}>
            SYSTEM PORT // ENCRYPTED SHA-SCRYPT AUTH // SECURE PROTOCOL
          </div>
        </div>
      </div>
    </div>
  );
};
