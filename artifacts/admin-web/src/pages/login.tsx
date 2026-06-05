import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, UserPlus, LogIn } from "lucide-react";

const API_BASE = `${window.location.origin}/api`;

export default function LoginPage() {
  const { login } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      await login({ username, password });
    } catch (err: any) {
      setLoginError(err?.data?.error ?? err?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    setRegSuccess("");
    if (regPassword !== regConfirm) {
      setRegError("Passwords do not match.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername.trim(), password: regPassword, name: regName.trim(), role: "admin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed.");
      setRegSuccess("Admin account created! You can now sign in.");
      setRegName(""); setRegUsername(""); setRegPassword(""); setRegConfirm("");
      setTimeout(() => { setTab("login"); setRegSuccess(""); }, 2000);
    } catch (err: any) {
      setRegError(err.message ?? "Registration failed.");
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-foreground/10 rounded flex items-center justify-center font-bold text-primary-foreground text-lg">
            B
          </div>
          <span className="text-primary-foreground font-bold text-xl tracking-tight">BEEPJEEP OPS</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold text-primary-foreground leading-tight mb-4">
            Fleet command<br />at your fingertips.
          </h1>
          <p className="text-primary-foreground/70 text-lg">
            Real-time fleet tracking, fare management, and performance insights — all in one place.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Live Tracking", desc: "Monitor all drivers in real time" },
            { label: "Fare Control", desc: "Set rates per fleet, per route" },
            { label: "Reports", desc: "Export daily CSV & Excel data" },
            { label: "Ratings", desc: "Review driver performance" },
          ].map((f) => (
            <div key={f.label} className="bg-primary-foreground/10 rounded-lg p-4">
              <div className="text-primary-foreground font-semibold text-sm mb-1">{f.label}</div>
              <div className="text-primary-foreground/60 text-xs">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-bold text-primary-foreground text-lg">
              B
            </div>
            <span className="font-bold text-xl tracking-tight">BEEPJEEP OPS</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Admin Portal</span>
            </div>
            <h2 className="text-2xl font-extrabold text-foreground">
              {tab === "login" ? "Sign in to your account" : "Create an admin account"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === "login"
                ? "Access is restricted to fleet administrators."
                : "Register a new fleet administrator account."}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-lg bg-muted p-1 mb-6 gap-1">
            <button
              onClick={() => { setTab("login"); setLoginError(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium rounded-md py-2 transition-all ${
                tab === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </button>
            <button
              onClick={() => { setTab("register"); setRegError(""); setRegSuccess(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium rounded-md py-2 transition-all ${
                tab === "register"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>

          {/* Login form */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {loginError}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_username"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          )}

          {/* Register form */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              {regError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {regError}
                </div>
              )}
              {regSuccess && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {regSuccess}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input
                  id="reg-name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-username">Username</Label>
                <Input
                  id="reg-username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="your_username"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Confirm Password</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={regLoading}>
                {regLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Create Admin Account
              </Button>
            </form>
          )}

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Only users with the <strong>admin</strong> role can access this portal.
            <br />Drivers and commuters must use the mobile app.
          </p>
        </div>
      </div>
    </div>
  );
}
