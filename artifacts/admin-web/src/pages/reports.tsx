import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  BarChart3,
  Clock,
  CheckCircle2,
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
  accent = "emerald",
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: "emerald" | "blue" | "orange" | "violet";
  loading?: boolean;
}) {
  const accents = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-600", ring: "ring-emerald-200 dark:ring-emerald-800" },
    blue: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: "text-blue-600", ring: "ring-blue-200 dark:ring-blue-800" },
    orange: { bg: "bg-orange-50 dark:bg-orange-950/30", icon: "text-orange-500", ring: "ring-orange-200 dark:ring-orange-800" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/30", icon: "text-violet-600", ring: "ring-violet-200 dark:ring-violet-800" },
  };
  const a = accents[accent];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p className="text-3xl font-extrabold text-foreground tracking-tight">{value}</p>
            )}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl ${a.bg} ring-1 ${a.ring} flex items-center justify-center flex-shrink-0 ${a.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className={`h-0.5 ${a.bg}`} />
      </CardContent>
    </Card>
  );
}

const SHEET_COLORS = [
  { label: "Summary", color: "bg-emerald-500", desc: "High-level metrics & totals" },
  { label: "Fare Records", color: "bg-orange-400", desc: "Raw transaction history" },
  { label: "Fleet Breakdown", color: "bg-violet-500", desc: "Per-fleet aggregates" },
  { label: "Driver Breakdown", color: "bg-sky-500", desc: "Driver performance" },
  { label: "Daily Trend", color: "bg-teal-500", desc: "Day-by-day fare totals" },
];

export default function ReportsPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  const [exportDone, setExportDone] = useState<"xlsx" | "csv" | null>(null);

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
    setExportDone(null);
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
      setExportDone(format);
      toast({ title: "Export ready", description: `Your ${format.toUpperCase()} report has been downloaded.` });
      setTimeout(() => setExportDone(null), 3000);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  }

  const maxDayFare = Math.max(...(summary?.last7Days?.map((d) => d.fare) ?? [1]), 1);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Reports & Export</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Live stats · refreshes every 60 s
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
          <BarChart3 className="h-3.5 w-3.5" />
          Last 30 days window
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Fare Today"
          value={summary ? `₱${(summary.totalFareToday ?? 0).toFixed(2)}` : "₱0.00"}
          sub={summary?.totalFareWeek != null ? `₱${summary.totalFareWeek.toFixed(2)} this week` : undefined}
          icon={TrendingUp}
          accent="emerald"
          loading={isLoading}
        />
        <StatCard
          label="Passengers Today"
          value={summary?.totalPassengersToday ?? 0}
          sub={summary?.totalPassengersWeek != null ? `${summary.totalPassengersWeek} this week` : undefined}
          icon={Users}
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          label="Fleet Drivers"
          value={summary?.totalFleetDrivers ?? 0}
          icon={Bus}
          accent="orange"
          loading={isLoading}
        />
        <StatCard
          label="Total Fleets"
          value={summary?.totalFleets ?? 0}
          icon={Building2}
          accent="violet"
          loading={isLoading}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-1">
          {/* Passenger types */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Passenger Types — Today
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : summary ? (
                <div className="space-y-4">
                  {[
                    { label: "Regular", value: summary.regularCount, bar: "bg-primary", text: "text-primary" },
                    { label: "Student", value: summary.studentCount, bar: "bg-sky-500", text: "text-sky-600" },
                    { label: "Senior / PWD", value: summary.seniorCount, bar: "bg-amber-400", text: "text-amber-600" },
                  ].map((row) => {
                    const total = summary.totalPassengersToday;
                    const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
                    return (
                      <div key={row.label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm text-foreground font-medium">{row.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-bold ${row.text}`}>{row.value}</span>
                            <span className="text-xs text-muted-foreground">({pct}%)</span>
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${row.bar}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Fleet breakdown */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Fleet Breakdown — Today
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : summary?.fleetBreakdown?.length ? (
                <div className="space-y-2">
                  {summary.fleetBreakdown.map((f, i) => (
                    <div
                      key={f.fleetId}
                      className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5 bg-muted/30 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{f.fleetName}</p>
                          <p className="text-xs text-muted-foreground">{f.passengers} pax</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600 shrink-0">₱{f.fare.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No fleet activity today.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-5 lg:col-span-2">
          {/* 7-day trend */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Daily Fare — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <Skeleton className="h-36 w-full" />
              ) : summary?.last7Days?.length ? (
                <div className="space-y-2">
                  {summary.last7Days.map((d) => {
                    const pct = maxDayFare > 0 ? (d.fare / maxDayFare) * 100 : 0;
                    const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-PH", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    });
                    const isToday = d.date === new Date().toISOString().split("T")[0];
                    return (
                      <div key={d.date} className="flex items-center gap-3 group">
                        <span className={`text-xs w-24 shrink-0 ${isToday ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                          {label}
                          {isToday && <span className="ml-1 text-primary text-[10px]">●</span>}
                        </span>
                        <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden relative">
                          <div
                            className="h-full rounded-lg bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-700"
                            style={{ width: `${pct}%`, minWidth: d.fare > 0 ? "6px" : "0" }}
                          />
                          {d.fare === 0 && (
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-muted-foreground">
                              No activity
                            </span>
                          )}
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
                <p className="text-sm text-muted-foreground text-center py-6">No data yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Top drivers */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Top Drivers — Last 7 Days
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : summary?.topDrivers?.length ? (
                <div className="space-y-1.5">
                  {summary.topDrivers.map((d, i) => {
                    const medals = ["🥇", "🥈", "🥉"];
                    return (
                      <div
                        key={d.name}
                        className={`flex items-center gap-3 py-2 px-3.5 rounded-xl transition-colors ${i === 0 ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800" : "hover:bg-muted/50"}`}
                      >
                        <span className="text-base w-6 text-center shrink-0">
                          {i < 3 ? medals[i] : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${i === 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                            {d.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{d.trips} trip{d.trips !== 1 ? "s" : ""}</p>
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${i === 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          ₱{d.fare.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No driver activity this week.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Export section */}
      <Card className="border-2 border-dashed border-border hover:border-primary/30 transition-colors">
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Export Fare Records — Last 30 Days</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Download a full report of all fare transactions across your fleets.
              </p>
            </div>
          </div>

          {/* Excel sheet preview */}
          <div className="mb-6 p-4 rounded-xl bg-muted/40 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              Excel file includes 5 sheets
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SHEET_COLORS.map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <div className={`h-1.5 rounded-full ${s.color}`} />
                  <p className="text-xs font-semibold">{s.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2 font-semibold"
              onClick={() => exportReport("xlsx")}
              disabled={!token || !!exporting}
              data-testid="button-export-xlsx"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : exportDone === "xlsx" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {exportDone === "xlsx" ? "Downloaded!" : "Export Excel (.xlsx)"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="sm:w-48 gap-2 font-semibold"
              onClick={() => exportReport("csv")}
              disabled={!token || !!exporting}
              data-testid="button-export-csv"
            >
              {exporting === "csv" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : exportDone === "csv" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {exportDone === "csv" ? "Downloaded!" : "Export CSV"}
            </Button>
          </div>

          <Separator className="my-4" />

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            CSV exports fare records only. Excel includes styled sheets with formatted currency, color-coded passenger types, and top-driver highlights.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
