import { useState, useEffect } from "react";
import { useGetFleets } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Save, MapPin, ChevronDown, ChevronRight } from "lucide-react";

interface RouteFare {
  regularFare: number;
  studentFare: number;
  seniorFare: number;
}

interface FleetRoute {
  id: number;
  fleetId: number;
  name: string;
}

function authHeader(): HeadersInit {
  const token = localStorage.getItem("bj_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function RouteFareCard({ route }: { route: FleetRoute }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regular, setRegular] = useState("");
  const [student, setStudent] = useState("");
  const [senior, setSenior] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/fare-settings?routeId=${route.id}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((data: RouteFare) => {
        setRegular(String(data.regularFare));
        setStudent(String(data.studentFare));
        setSenior(String(data.seniorFare));
      })
      .catch(() => {
        setRegular("13");
        setStudent("10");
        setSenior("10");
      })
      .finally(() => setLoading(false));
  }, [route.id]);

  async function handleSave() {
    const r = parseFloat(regular);
    const s = parseFloat(student);
    const sr = parseFloat(senior);
    if (isNaN(r) || isNaN(s) || isNaN(sr) || r <= 0 || s <= 0 || sr <= 0) {
      toast({ title: "Invalid values", description: "All fares must be positive numbers.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fare-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ regularFare: r, studentFare: s, seniorFare: sr, routeId: route.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to save");
      }
      toast({ title: "Fare settings saved", description: `Updated fares for ${route.name}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <span className="font-medium text-sm">{route.name}</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Regular (₱)", value: regular, set: setRegular, id: "regular" },
              { label: "Student (₱)", value: student, set: setStudent, id: "student" },
              { label: "Senior (₱)", value: senior, set: setSenior, id: "senior" },
            ].map((f) => (
              <div key={f.id} className="space-y-1">
                <Label htmlFor={`route-${route.id}-${f.id}`} className="text-xs text-muted-foreground">{f.label}</Label>
                <Input
                  id={`route-${route.id}-${f.id}`}
                  type="number"
                  min="0"
                  step="0.50"
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save Fares"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FleetRoutesCard({ fleet }: { fleet: { id: number; name: string } }) {
  const [routes, setRoutes] = useState<FleetRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/routes/fleet/${fleet.id}`, { headers: authHeader() })
      .then((r) => r.json())
      .then((data: FleetRoute[]) => setRoutes(data))
      .catch(() => setRoutes([]))
      .finally(() => setLoading(false));
  }, [fleet.id]);

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{fleet.name}</CardTitle>
              {!loading && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {routes.length} {routes.length === 1 ? "route" : "routes"}
                </p>
              )}
            </div>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
            </div>
          ) : routes.length === 0 ? (
            <div className="py-8 text-center">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No routes for this fleet yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Create routes in the Routes page first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map((r) => <RouteFareCard key={r.id} route={r} />)}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function FaresPage() {
  const { data: fleets, isLoading } = useGetFleets();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Fare Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Set regular, student, and senior fares per route.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-lg" />)}
        </div>
      ) : fleets && fleets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fleets.map((f) => <FleetRoutesCard key={f.id} fleet={f} />)}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No fleets yet</p>
            <p className="text-muted-foreground text-sm mt-1">Create a fleet first to configure its fare rates.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
