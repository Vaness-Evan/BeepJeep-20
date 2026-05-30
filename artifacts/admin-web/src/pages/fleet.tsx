import { useState } from "react";
import {
  useGetFleets,
  useCreateFleet,
  useDeleteFleet,
  useGetFleetDrivers,
  useAddFleetDriver,
  useRemoveFleetDriver,
  getGetFleetsQueryKey,
  getGetFleetDriversQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, Bus, Building2, Map } from "lucide-react";
import RouteBuilder from "@/components/RouteBuilder";
import { useQuery } from "@tanstack/react-query";

interface FleetRoute {
  id: number;
  fleetId: number;
  name: string;
  waypoints: { lat: number; lng: number }[];
  routeCoords: { lat: number; lng: number }[];
  updatedAt: string;
}

function useFleetRoute(fleetId: number, enabled: boolean) {
  return useQuery<FleetRoute | null>({
    queryKey: ["fleet-route", fleetId],
    queryFn: async () => {
      const res = await fetch(`/api/routes/fleet/${fleetId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
  });
}

function FleetDriverRow({ fleetId, driver }: { fleetId: number; driver: { id: number; name: string; username: string; vehicleNumber?: string | null; route?: string | null } }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const remove = useRemoveFleetDriver({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFleetDriversQueryKey(fleetId) });
        qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
        toast({ title: "Driver removed" });
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e?.response?.data?.error ?? "Failed", variant: "destructive" });
      },
    },
  });

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 group" data-testid={`row-driver-${driver.id}`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
        {driver.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{driver.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          @{driver.username}
          {driver.vehicleNumber ? ` · ${driver.vehicleNumber}` : ""}
          {driver.route ? ` · ${driver.route}` : ""}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" data-testid={`button-remove-driver-${driver.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove driver?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{driver.name}</strong> from the fleet. Their account will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate({ fleetId, driverId: driver.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FleetCard({ fleet }: { fleet: { id: number; name: string; driverCount: number; createdAt: string } }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: "", username: "", password: "", vehicleNumber: "", route: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: drivers, isLoading: driversLoading } = useGetFleetDrivers(fleet.id, {
    query: { enabled: expanded, queryKey: getGetFleetDriversQueryKey(fleet.id) },
  });

  const { data: fleetRoute, refetch: refetchRoute } = useFleetRoute(fleet.id, true);

  const addDriver = useAddFleetDriver({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFleetDriversQueryKey(fleet.id) });
        qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
        setShowAddDriver(false);
        setDriverForm({ name: "", username: "", password: "", vehicleNumber: "", route: "" });
        toast({ title: "Driver added" });
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e?.response?.data?.error ?? "Failed", variant: "destructive" });
      },
    },
  });

  const deleteFleet = useDeleteFleet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
        toast({ title: "Fleet deleted" });
      },
    },
  });

  return (
    <Card data-testid={`card-fleet-${fleet.id}`}>
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground">{fleet.name}</div>
          <div className="text-xs text-muted-foreground">
            {fleet.driverCount} driver{fleet.driverCount !== 1 ? "s" : ""}
            {fleetRoute ? ` · Route: ${fleetRoute.name}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
            onClick={(e) => { e.stopPropagation(); setShowRouteBuilder(true); }}
            data-testid={`button-route-builder-${fleet.id}`}
          >
            <Map className="h-3 w-3" />
            {fleetRoute ? "Route" : "Add Route"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-delete-fleet-${fleet.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete fleet "{fleet.name}"?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete the fleet and all associated records.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteFleet.mutate({ fleetId: fleet.id })}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-5 border-t border-border">
          <div className="flex items-center justify-between py-3 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drivers</span>
            <Button size="sm" variant="outline" onClick={() => setShowAddDriver(true)} data-testid={`button-add-driver-${fleet.id}`}>
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Add Driver
            </Button>
          </div>

          {driversLoading ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
          ) : drivers && drivers.length > 0 ? (
            <div className="space-y-0.5">
              {drivers.map((d) => (
                <FleetDriverRow key={d.id} fleetId={fleet.id} driver={d} />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Bus className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No drivers in this fleet yet.
            </div>
          )}
        </CardContent>
      )}

      {/* Route Builder Dialog */}
      <Dialog open={showRouteBuilder} onOpenChange={setShowRouteBuilder}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Map className="h-5 w-5 text-orange-500" />
              Route Builder — {fleet.name}
            </DialogTitle>
          </DialogHeader>
          <RouteBuilder
            fleetId={fleet.id}
            fleetName={fleet.name}
            existingRoute={fleetRoute}
            onSaved={() => { refetchRoute(); }}
            onDeleted={() => { refetchRoute(); }}
          />
        </DialogContent>
      </Dialog>

      {/* Add Driver Dialog */}
      <Dialog open={showAddDriver} onOpenChange={setShowAddDriver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Driver to {fleet.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(["name", "username", "password", "vehicleNumber", "route"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`driver-${field}`} className="capitalize">{field === "vehicleNumber" ? "Vehicle Number (optional)" : field === "route" ? "Route (optional)" : field}</Label>
                <Input
                  id={`driver-${field}`}
                  data-testid={`input-driver-${field}`}
                  type={field === "password" ? "password" : "text"}
                  value={driverForm[field]}
                  onChange={(e) => setDriverForm((p) => ({ ...p, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDriver(false)}>Cancel</Button>
            <Button
              onClick={() => addDriver.mutate({ fleetId: fleet.id, data: driverForm })}
              disabled={addDriver.isPending || !driverForm.name || !driverForm.username || !driverForm.password}
              data-testid="button-submit-add-driver"
            >
              {addDriver.isPending ? "Adding..." : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function FleetPage() {
  const { data: fleets, isLoading } = useGetFleets();
  const [showCreate, setShowCreate] = useState(false);
  const [newFleetName, setNewFleetName] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const createFleet = useCreateFleet({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
        setShowCreate(false);
        setNewFleetName("");
        toast({ title: "Fleet created" });
      },
      onError: (e: any) => {
        toast({ title: "Error", description: e?.response?.data?.error ?? "Failed", variant: "destructive" });
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Fleet & Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your fleets, drivers, and jeepney routes.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-fleet">
          <Plus className="h-4 w-4 mr-1.5" />
          New Fleet
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : fleets && fleets.length > 0 ? (
        <div className="space-y-3">
          {fleets.map((f) => <FleetCard key={f.id} fleet={f} />)}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="font-semibold text-foreground">No fleets yet</p>
            <p className="text-muted-foreground text-sm mt-1">Create a fleet to start adding drivers.</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>Create your first fleet</Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Fleet</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="fleet-name">Fleet Name</Label>
            <Input
              id="fleet-name"
              data-testid="input-fleet-name"
              value={newFleetName}
              onChange={(e) => setNewFleetName(e.target.value)}
              placeholder="e.g. North Route Fleet"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createFleet.mutate({ data: { name: newFleetName } })}
              disabled={createFleet.isPending || !newFleetName.trim()}
              data-testid="button-submit-create-fleet"
            >
              {createFleet.isPending ? "Creating..." : "Create Fleet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
