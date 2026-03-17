import { useState } from "react";
import { loginWithEmail } from "../api";
import type { AuthUser } from "../api";

interface Props {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await loginWithEmail(email.trim());
      localStorage.setItem("auth_token", res.data.token);
      onLogin(res.data.user);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🏗</div>
        <h1 className="login-title">Construction Programme Manager</h1>
        <p className="login-subtitle">Enter your email to access your programmes</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div>
            <label className="field-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              className="field-input login-email-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-lg login-submit"
            disabled={loading || !email.trim()}
          >
            {loading ? "Signing in…" : "Sign In →"}
          </button>
          <p className="login-note">
            No password needed. Each email address has its own private workspace.
          </p>
        </form>
      </div>
    </div>
  );
}
