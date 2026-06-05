import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Users,
  Bus,
  Building2,
  Trophy,
  Calendar,
  Loader2,
} from "lucide-react";

interface FleetBreakdown {
  fleetId: number;
  fleetName: string;
  fare: number;
  passengers: number;
}

interface DayStats {
  date: string;
  fare: number;
  passengers: number;
}

interface TopDriver {
  name: string;
  fare: number;
  trips: number;
}

interface ReportsSummary {
  totalFareToday: number;
  totalFareWeek: number;
  totalPassengersToday: number;
  totalPassengersWeek: number;
  regularCount: number;
  studentCount: number;
  seniorCount: number;
  totalFleetDrivers: number;
  totalFleets: number;
  fleetBreakdown: FleetBreakdown[];
  last7Days: DayStats[];
  topDrivers: TopDriver[];
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-primary",
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className="text-2xl font-extrabold text-foreground">{value}</p>
            )}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);

  const { data: summary, isLoading } = useQuery<ReportsSummary>({
    queryKey: ["reports-summary"],
    queryFn: async () => {
      const res = await fetch("/api/reports/summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60_000,
  });

  async function exportReport(format: "xlsx" | "csv") {
    if (!token) return;
    setExporting(format);
    try {
      const res = await fetch(`/api/reports/export?format=${format}&days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `beepjeep-report-${Date.now()}.${format === "xlsx" ? "xlsx" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `Your ${format.toUpperCase()} report has been downloaded.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  const maxDayFare = Math.max(...(summary?.last7Days?.map((d) => d.fare) ?? [1]), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Reports & Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live stats for your fleets and downloadable fare reports.
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Fare Today"
          value={summary ? `₱${(summary.totalFareToday ?? 0).toFixed(2)}` : "₱0.00"}
          sub={summary?.totalFareWeek != null ? `₱${summary.totalFareWeek.toFixed(2)} this week` : undefined}
          icon={TrendingUp}
          color="text-emerald-600"
          loading={isLoading}
        />
        <StatCard
          label="Passengers Today"
          value={summary?.totalPassengersToday ?? 0}
          sub={summary?.totalPassengersWeek != null ? `${summary.totalPassengersWeek} this week` : undefined}
          icon={Users}
          color="text-blue-600"
          loading={isLoading}
        />
        <StatCard
          label="Fleet Drivers"
          value={summary?.totalFleetDrivers ?? 0}
          icon={Bus}
          color="text-orange-500"
          loading={isLoading}
        />
        <StatCard
          label="Total Fleets"
          value={summary?.totalFleets ?? 0}
          icon={Building2}
          color="text-violet-600"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: passenger types + fleet breakdown */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Passenger Types — Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : summary ? (
                <div className="space-y-3">
                  {[
                    { label: "Regular", value: summary.regularCount, color: "bg-primary", pct: summary.totalPassengersToday },
                    { label: "Student", value: summary.studentCount, color: "bg-emerald-500", pct: summary.totalPassengersToday },
                    { label: "Senior / PWD", value: summary.seniorCount, color: "bg-amber-500", pct: summary.totalPassengersToday },
                  ].map((row) => {
                    const pct = row.pct > 0 ? Math.round((row.value / row.pct) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${row.color}`} />
                            <span className="text-muted-foreground">{row.label}</span>
                          </div>
                          <span className="font-semibold">{row.value} <span className="text-muted-foreground font-normal text-xs">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Fleet breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Fleet Breakdown — Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : summary?.fleetBreakdown?.length ? (
                <div className="space-y-2">
                  {summary.fleetBreakdown.map((f) => (
                    <div key={f.fleetId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 bg-background">
                      <div>
                        <p className="text-sm font-semibold truncate">{f.fleetName}</p>
                        <p className="text-xs text-muted-foreground">{f.passengers} passenger{f.passengers !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">₱{f.fare.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No fleet activity today.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: 7-day trend + top drivers */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Daily Fare — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-28 w-full" />
              ) : summary?.last7Days?.length ? (
                <div className="space-y-2">
                  {summary.last7Days.map((d) => {
                    const pct = maxDayFare > 0 ? (d.fare / maxDayFare) * 100 : 0;
                    const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
                    return (
                      <div key={d.date} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                        <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-400 transition-all"
                            style={{ width: `${pct}%`, minWidth: d.fare > 0 ? "4px" : "0" }}
                          />
                        </div>
                        <div className="text-right w-28 shrink-0">
                          <span className="text-xs font-semibold">₱{d.fare.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">{d.passengers} pax</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Top Drivers — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : summary?.topDrivers?.length ? (
                <div className="space-y-1">
                  {summary.topDrivers.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50">
                      <span className={`text-xs font-bold w-5 text-center shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {d.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.trips} trip{d.trips !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 shrink-0">₱{d.fare.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No driver activity this week.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Export Fare Records — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-5">
            Download a full report of all fare records across your fleets. The Excel export includes
            five sheets: Summary, Fare Records, Fleet Breakdown, Driver Breakdown, and Daily Trend.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1"
              onClick={() => exportReport("xlsx")}
              disabled={!token || !!exporting}
              data-testid="button-export-xlsx"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Export Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => exportReport("csv")}
              disabled={!token || !!exporting}
              data-testid="button-export-csv"
            >
              {exporting === "csv" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Export CSV
            </Button>
          </div>
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            Excel includes 5 sheets: Summary · Fare Records · Fleet Breakdown · Driver Breakdown · Daily Trend.
            CSV exports only the raw fare records sheet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
