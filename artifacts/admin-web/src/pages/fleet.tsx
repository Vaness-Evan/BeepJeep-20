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
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Plus, Trash2, UserPlus, Bus, Building2, Map, UserCheck, Pencil } from "lucide-react";
import RouteBuilder from "@/components/RouteBuilder";
import { useQuery as useQueryGeneric } from "@tanstack/react-query";

interface FleetRoute {
  id: number;
  fleetId: number;
  name: string;
  waypoints: { lat: number; lng: number }[];
  routeCoords: { lat: number; lng: number }[];
  updatedAt: string;
}

interface Jeep {
  id: number;
  fleetId: number;
  vehicleNumber: string;
  createdAt: string;
  driver: { id: number; name: string; username: string; route?: string | null } | null;
}

interface Driver {
  id: number;
  name: string;
  username: string;
  route?: string | null;
  jeepId?: number | null;
  createdAt: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("bj_token");
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function useFleetRoute(fleetId: number) {
  return useQueryGeneric<FleetRoute | null>({
    queryKey: ["fleet-route", fleetId],
    queryFn: async () => {
      const res = await fetch(`/api/routes/fleet/${fleetId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

function useFleetJeeps(fleetId: number, enabled: boolean) {
  return useQuery<Jeep[]>({
    queryKey: ["fleet-jeeps", fleetId],
    queryFn: () => apiFetch(`/api/fleets/${fleetId}/jeeps`),
    enabled,
  });
}

function useFleetDriversList(fleetId: number, enabled: boolean) {
  return useQuery<Driver[]>({
    queryKey: ["fleet-drivers-list", fleetId],
    queryFn: () => apiFetch(`/api/fleets/${fleetId}/drivers`),
    enabled,
  });
}

function JeepRow({ fleetId, jeep, allDrivers, onRefresh }: {
  fleetId: number;
  jeep: Jeep;
  allDrivers: Driver[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [showAssign, setShowAssign] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  const unassignedDrivers = allDrivers.filter((d) => !d.jeepId || d.jeepId === jeep.id);

  const assignDriver = useMutation({
    mutationFn: (driverId: number) =>
      apiFetch(`/api/jeeps/${jeep.id}/assign-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      }),
    onSuccess: () => {
      toast({ title: "Driver assigned" });
      onRefresh();
      setShowAssign(false);
      setSelectedDriverId("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unassignDriver = useMutation({
    mutationFn: () => apiFetch(`/api/jeeps/${jeep.id}/driver`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Driver unassigned" }); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteJeep = useMutation({
    mutationFn: () => apiFetch(`/api/jeeps/${jeep.id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Jeepney removed" }); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 group">
        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
          <Bus className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{jeep.vehicleNumber}</div>
          <div className="text-xs text-muted-foreground truncate">
            {jeep.driver ? (
              <span className="text-green-600 font-medium">{jeep.driver.name} (@{jeep.driver.username})</span>
            ) : (
              <span className="text-muted-foreground italic">No driver assigned</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {jeep.driver ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => unassignDriver.mutate()}>
              Unassign
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-primary" onClick={() => setShowAssign(true)}>
              <UserCheck className="h-3 w-3" /> Assign
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove jeepney "{jeep.vehicleNumber}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the jeepney{jeep.driver ? ` and unassign ${jeep.driver.name}` : ""}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteJeep.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Driver to {jeep.vehicleNumber}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {unassignedDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No available drivers. Add drivers to this fleet first.</p>
            ) : (
              <div className="space-y-1.5">
                <Label>Select Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedDrivers.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name} (@{d.username}){d.jeepId ? " — currently assigned" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button
              disabled={!selectedDriverId || assignDriver.isPending}
              onClick={() => assignDriver.mutate(parseInt(selectedDriverId))}
            >
              {assignDriver.isPending ? "Assigning..." : "Assign Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DriverRow({ fleetId, driver, onRefresh }: {
  fleetId: number;
  driver: Driver;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: driver.name, username: driver.username, password: "" });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/fleets/${fleetId}/drivers/${driver.id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Driver removed" }); onRefresh(); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const edit = useMutation({
    mutationFn: () => apiFetch(`/api/fleets/${fleetId}/drivers/${driver.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    }),
    onSuccess: () => {
      toast({ title: "Driver updated" });
      setShowEdit(false);
      setEditForm((f) => ({ ...f, password: "" }));
      onRefresh();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openEdit() {
    setEditForm({ name: driver.name, username: driver.username, password: "" });
    setShowEdit(true);
  }

  return (
    <>
      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 group">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
          {driver.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate flex items-center gap-2">
            {driver.name}
            {driver.jeepId ? (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Assigned</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">Unassigned</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            @{driver.username}{driver.route ? ` · ${driver.route}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={openEdit}
            title="Edit driver"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove driver?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{driver.name}</strong>'s account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => remove.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Edit Driver Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Driver — {driver.name}</DialogTitle>
            <DialogDescription>Update the driver's name, username, or password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-name-${driver.id}`}>Full Name</Label>
              <Input
                id={`edit-name-${driver.id}`}
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-username-${driver.id}`}>Username</Label>
              <Input
                id={`edit-username-${driver.id}`}
                value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-password-${driver.id}`}>
                New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span>
              </Label>
              <Input
                id={`edit-password-${driver.id}`}
                type="password"
                placeholder="Min 6 characters"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={() => edit.mutate()}
              disabled={edit.isPending || !editForm.name.trim() || !editForm.username.trim()}
            >
              {edit.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FleetCard({ fleet }: { fleet: { id: number; name: string; driverCount: number; createdAt: string } }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddJeep, setShowAddJeep] = useState(false);
  const [showRouteBuilder, setShowRouteBuilder] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: "", username: "", password: "" });
  const [vehicleNumber, setVehicleNumber] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: drivers, isLoading: driversLoading, refetch: refetchDrivers } = useFleetDriversList(fleet.id, expanded);
  const { data: jeeps, isLoading: jeepsLoading, refetch: refetchJeeps } = useFleetJeeps(fleet.id, expanded);
  const { data: fleetRoute, refetch: refetchRoute } = useFleetRoute(fleet.id);

  function refreshAll() {
    refetchDrivers();
    refetchJeeps();
    qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
  }

  const addDriver = useMutation({
    mutationFn: () =>
      apiFetch(`/api/fleets/${fleet.id}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverForm),
      }),
    onSuccess: () => {
      refreshAll();
      setShowAddDriver(false);
      setDriverForm({ name: "", username: "", password: "" });
      toast({ title: "Driver added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addJeep = useMutation({
    mutationFn: () =>
      apiFetch(`/api/fleets/${fleet.id}/jeeps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleNumber }),
      }),
    onSuccess: () => {
      refreshAll();
      setShowAddJeep(false);
      setVehicleNumber("");
      toast({ title: "Jeepney added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteFleet = useMutation({
    mutationFn: () => apiFetch(`/api/fleets/${fleet.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetFleetsQueryKey() });
      toast({ title: "Fleet deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const driverCount = drivers?.length ?? fleet.driverCount;
  const jeepCount = jeeps?.length ?? 0;

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
          <div className="text-xs text-muted-foreground flex gap-2">
            <span>{driverCount} driver{driverCount !== 1 ? "s" : ""}</span>
            {expanded && <span>· {jeepCount} jeepne{jeepCount !== 1 ? "ys" : "y"}</span>}
            {fleetRoute ? <span>· Route: {fleetRoute.name}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
            onClick={() => setShowRouteBuilder(true)}
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
                  onClick={() => deleteFleet.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div onClick={() => setExpanded(!expanded)} className="cursor-pointer">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-5 border-t border-border">
          <Tabs defaultValue="drivers" className="mt-3">
            <TabsList className="mb-3">
              <TabsTrigger value="drivers" className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Drivers
                {drivers && drivers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{drivers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="jeepneys" className="gap-1.5">
                <Bus className="h-3.5 w-3.5" /> Jeepneys
                {jeeps && jeeps.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">{jeeps.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* DRIVERS TAB */}
            <TabsContent value="drivers">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet Drivers</span>
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
                    <DriverRow key={d.id} fleetId={fleet.id} driver={d} onRefresh={refreshAll} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No drivers yet. Add your first driver.
                </div>
              )}
            </TabsContent>

            {/* JEEPNEYS TAB */}
            <TabsContent value="jeepneys">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet Jeepneys</span>
                <Button size="sm" variant="outline" onClick={() => setShowAddJeep(true)} data-testid={`button-add-jeep-${fleet.id}`}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Jeepney
                </Button>
              </div>
              {jeepsLoading ? (
                <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : jeeps && jeeps.length > 0 ? (
                <div className="space-y-0.5">
                  {jeeps.map((j) => (
                    <JeepRow key={j.id} fleetId={fleet.id} jeep={j} allDrivers={drivers ?? []} onRefresh={refreshAll} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Bus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No jeepneys yet. Add one and assign a driver.
                </div>
              )}
            </TabsContent>
          </Tabs>
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
            existingRoute={fleetRoute ?? undefined}
            onSaved={() => refetchRoute()}
            onDeleted={() => refetchRoute()}
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
            {(["name", "username", "password"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`driver-${field}`} className="capitalize">{field}</Label>
                <Input
                  id={`driver-${field}`}
                  data-testid={`input-driver-${field}`}
                  type={field === "password" ? "password" : "text"}
                  placeholder={field === "name" ? "Full name" : field === "username" ? "Login username" : "Min 6 characters"}
                  value={driverForm[field]}
                  onChange={(e) => setDriverForm((p) => ({ ...p, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDriver(false)}>Cancel</Button>
            <Button
              onClick={() => addDriver.mutate()}
              disabled={addDriver.isPending || !driverForm.name || !driverForm.username || !driverForm.password}
              data-testid="button-submit-add-driver"
            >
              {addDriver.isPending ? "Adding..." : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Jeepney Dialog */}
      <Dialog open={showAddJeep} onOpenChange={setShowAddJeep}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Jeepney to {fleet.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="jeep-plate">Plate / Vehicle Number</Label>
            <Input
              id="jeep-plate"
              data-testid="input-jeep-vehicle-number"
              placeholder="e.g. ABС 1234"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">You can assign a driver after creating the jeepney.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddJeep(false)}>Cancel</Button>
            <Button
              onClick={() => addJeep.mutate()}
              disabled={addJeep.isPending || !vehicleNumber.trim()}
              data-testid="button-submit-add-jeep"
            >
              {addJeep.isPending ? "Adding..." : "Add Jeepney"}
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
          <h1 className="text-2xl font-extrabold tracking-tight">Fleet Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage fleets, add drivers and jeepneys, and assign drivers to vehicles.</p>
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
            <p className="text-muted-foreground text-sm mt-1">Create a fleet to start adding drivers and jeepneys.</p>
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
