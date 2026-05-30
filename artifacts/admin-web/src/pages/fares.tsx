import { useState, useEffect } from "react";
import {
  useGetFleets,
  useGetFareSettings,
  useUpdateFareSettings,
  getGetFareSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Save, Building2 } from "lucide-react";

function FareSettingsCard({ fleet }: { fleet: { id: number; name: string } }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: fareData, isLoading } = useGetFareSettings(
    { fleetId: fleet.id },
    { query: { queryKey: getGetFareSettingsQueryKey({ fleetId: fleet.id }) } }
  );

  const [regular, setRegular] = useState("");
  const [student, setStudent] = useState("");
  const [senior, setSenior] = useState("");

  useEffect(() => {
    if (fareData) {
      setRegular(String(fareData.regularFare));
      setStudent(String(fareData.studentFare));
      setSenior(String(fareData.seniorFare));
    }
  }, [fareData]);

  const update = useUpdateFareSettings({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFareSettingsQueryKey({ fleetId: fleet.id }) });
        toast({ title: "Fare settings saved", description: `Updated fares for ${fleet.name}` });
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e?.response?.data?.error ?? "Failed to save", variant: "destructive" });
      },
    },
  });

  function handleSave() {
    const r = parseFloat(regular);
    const s = parseFloat(student);
    const sr = parseFloat(senior);
    if (isNaN(r) || isNaN(s) || isNaN(sr) || r <= 0 || s <= 0 || sr <= 0) {
      toast({ title: "Invalid values", description: "All fares must be positive numbers.", variant: "destructive" });
      return;
    }
    update.mutate({ data: { regularFare: r, studentFare: s, seniorFare: sr, fleetId: fleet.id } });
  }

  return (
    <Card data-testid={`card-fares-${fleet.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Building2 className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">{fleet.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Regular (₱)", value: regular, set: setRegular, id: "regular" },
                { label: "Student (₱)", value: student, set: setStudent, id: "student" },
                { label: "Senior (₱)", value: senior, set: setSenior, id: "senior" },
              ].map((f) => (
                <div key={f.id} className="space-y-1.5">
                  <Label htmlFor={`${fleet.id}-${f.id}`} className="text-xs">{f.label}</Label>
                  <Input
                    id={`${fleet.id}-${f.id}`}
                    data-testid={`input-fare-${fleet.id}-${f.id}`}
                    type="number"
                    min="0"
                    step="0.50"
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                  />
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleSave}
              disabled={update.isPending}
              data-testid={`button-save-fares-${fleet.id}`}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {update.isPending ? "Saving..." : "Save Fares"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FaresPage() {
  const { data: fleets, isLoading } = useGetFleets();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Fare Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Set regular, student, and senior fares per fleet.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
        </div>
      ) : fleets && fleets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fleets.map((f) => <FareSettingsCard key={f.id} fleet={f} />)}
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
