import { useGetReportsSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { DollarSign, Users, Bus, Building2 } from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold text-foreground" data-testid={`stat-${title.toLowerCase().replace(/ /g, "-")}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetReportsSummary();

  const total = summary
    ? summary.regularCount + summary.studentCount + summary.seniorCount
    : 0;

  const breakdown = summary
    ? [
        { label: "Regular", count: summary.regularCount, color: "bg-primary" },
        { label: "Student", count: summary.studentCount, color: "bg-emerald-500" },
        { label: "Senior", count: summary.seniorCount, color: "bg-amber-500" },
      ]
    : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          Good to see you, {user?.name?.split(" ")[0]}.
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Today's fleet summary — live data.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Fare Today"
            value={`₱${summary.totalFareToday.toFixed(2)}`}
            icon={DollarSign}
            color="bg-primary/10 text-primary"
          />
          <StatCard
            title="Passengers Today"
            value={summary.totalPassengersToday}
            icon={Users}
            color="bg-emerald-100 text-emerald-600"
          />
          <StatCard
            title="Fleet Drivers"
            value={summary.totalFleetDrivers}
            icon={Bus}
            color="bg-violet-100 text-violet-600"
          />
          <StatCard
            title="Total Fleets"
            value={summary.totalFleets}
            icon={Building2}
            color="bg-amber-100 text-amber-600"
          />
        </div>
      ) : null}

      {summary && total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Passenger Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {breakdown.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-foreground">{b.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {b.count} ({total ? Math.round((b.count / total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${b.color}`}
                      style={{ width: total ? `${(b.count / total) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && total === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No passenger activity recorded today yet.</p>
            <p className="text-muted-foreground/70 text-sm mt-1">Data will appear once drivers start recording fares.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
