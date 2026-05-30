import { useGetReportsSummary } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Download, FileSpreadsheet, FileText, BarChart3 } from "lucide-react";

const API_BASE = "/api";

export default function ReportsPage() {
  const { token } = useAuth();
  const { data: summary, isLoading } = useGetReportsSummary();

  function exportReport(format: "xlsx" | "csv") {
    if (!token) return;
    const url = `${API_BASE}/reports/export?format=${format}&token=${encodeURIComponent(token)}&days=30`;
    window.open(url, "_blank");
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Reports & Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Summary stats and export fare records for your fleets.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Today's Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : summary ? (
              <dl className="space-y-3">
                {[
                  { label: "Total Fare", value: `₱${summary.totalFareToday.toFixed(2)}` },
                  { label: "Total Passengers", value: summary.totalPassengersToday },
                  { label: "Fleet Drivers", value: summary.totalFleetDrivers },
                  { label: "Total Fleets", value: summary.totalFleets },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm font-semibold text-foreground" data-testid={`report-${row.label.toLowerCase().replace(/ /g, "-")}`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No data available yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Passenger Types</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : summary ? (
              <dl className="space-y-3">
                {[
                  { label: "Regular", value: summary.regularCount, color: "bg-primary" },
                  { label: "Student", value: summary.studentCount, color: "bg-emerald-500" },
                  { label: "Senior", value: summary.seniorCount, color: "bg-amber-500" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${row.color}`} />
                      <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    </div>
                    <dd className="text-sm font-semibold text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">No data available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Export Fare Records — Last 30 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Download a full report of all fare records across your fleets for the past 30 days. 
            Choose Excel for multi-sheet summaries or CSV for raw data.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1"
              onClick={() => exportReport("xlsx")}
              disabled={!token}
              data-testid="button-export-xlsx"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => exportReport("csv")}
              disabled={!token}
              data-testid="button-export-csv"
            >
              <FileText className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            The Excel export includes a summary sheet and a detailed fare records sheet. 
            Both formats are filtered to your fleets only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
