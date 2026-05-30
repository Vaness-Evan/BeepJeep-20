import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ username, password });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
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

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-bold text-primary-foreground text-lg">
              B
            </div>
            <span className="font-bold text-xl tracking-tight">BEEPJEEP OPS</span>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Admin Portal</span>
            </div>
            <h2 className="text-2xl font-extrabold text-foreground">Sign in to your account</h2>
            <p className="text-sm text-muted-foreground mt-1">Access is restricted to fleet administrators.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center">
            Only users with the <strong>admin</strong> role can access this portal.
            <br />Drivers and commuters must use the mobile app.
          </p>
        </div>
      </div>
    </div>
  );
}
