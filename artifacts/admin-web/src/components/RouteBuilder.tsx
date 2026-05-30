import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Trash2, Undo2, Save, Loader2, Route } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Waypoint {
  lat: number;
  lng: number;
}

interface Props {
  fleetId: number;
  fleetName: string;
  existingRoute?: { name: string; waypoints: Waypoint[]; routeCoords: Waypoint[] } | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_COLOR = "#f97316";
const DEFAULT_CENTER: [number, number] = [13.9236, 122.0794];

async function fetchOsrmRoute(waypoints: Waypoint[]): Promise<Waypoint[]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const url = `${OSRM_BASE}/${coords}?geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM request failed");
  const data = await res.json();
  const geomCoords: [number, number][] = data?.routes?.[0]?.geometry?.coordinates ?? [];
  return geomCoords.map(([lng, lat]) => ({ lat, lng }));
}

function makePin(index: number) {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 4px;
      background:${ROUTE_COLOR};transform:rotate(-45deg);
      border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:11px;font-weight:700;color:white;">${index + 1}</span></div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 24],
    popupAnchor: [0, -26],
  });
}

export default function RouteBuilder({ fleetId, fleetName, existingRoute, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);

  const [waypoints, setWaypoints] = useState<Waypoint[]>(existingRoute?.waypoints ?? []);
  const [routeCoords, setRouteCoords] = useState<Waypoint[]>(existingRoute?.routeCoords ?? []);
  const [routeName, setRouteName] = useState(existingRoute?.name ?? `${fleetName} Route`);
  const [snapping, setSnapping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [building, setBuilding] = useState(!existingRoute);

  const snapRoute = useCallback(async (wps: Waypoint[]) => {
    if (wps.length < 2) {
      setRouteCoords([]);
      return;
    }
    setSnapping(true);
    try {
      const coords = await fetchOsrmRoute(wps);
      setRouteCoords(coords);
    } catch {
      toast({ title: "Road snap failed", description: "Could not connect to routing service.", variant: "destructive" });
      setRouteCoords(wps);
    } finally {
      setSnapping(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: DEFAULT_CENTER, zoom: 13 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!building) return;

    function onClick(e: L.LeafletMouseEvent) {
      const wp = { lat: e.latlng.lat, lng: e.latlng.lng };
      setWaypoints((prev) => {
        const next = [...prev, wp];
        snapRoute(next);
        return next;
      });
    }
    map.on("click", onClick);
    map.getContainer().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getContainer().style.cursor = "";
    };
  }, [building, snapRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    waypoints.forEach((wp, i) => {
      const marker = L.marker([wp.lat, wp.lng], { icon: makePin(i) })
        .addTo(map)
        .bindPopup(`Pin ${i + 1}`);
      markersRef.current.push(marker);
    });

    if (waypoints.length > 0 && !existingRoute) {
      map.panTo([waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng]);
    }
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

    if (routeCoords.length > 1) {
      const latlngs = routeCoords.map((c) => [c.lat, c.lng] as [number, number]);
      polylineRef.current = L.polyline(latlngs, {
        color: ROUTE_COLOR,
        weight: 5,
        opacity: 0.85,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(map);
    } else if (waypoints.length === 1) {
      map.panTo([waypoints[0].lat, waypoints[0].lng]);
    }
  }, [routeCoords]);

  useEffect(() => {
    if (!existingRoute || !mapRef.current) return;
    const coords = existingRoute.routeCoords;
    if (coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng]));
    mapRef.current.fitBounds(bounds, { padding: [40, 40] });
  }, []);

  function undoLast() {
    setWaypoints((prev) => {
      const next = prev.slice(0, -1);
      snapRoute(next);
      return next;
    });
  }

  function clearAll() {
    setWaypoints([]);
    setRouteCoords([]);
  }

  async function saveRoute() {
    if (waypoints.length < 2) {
      toast({ title: "Place at least 2 pins", description: "Click on the map to set the route path.", variant: "destructive" });
      return;
    }
    if (!routeName.trim()) {
      toast({ title: "Route name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/routes/fleet/${fleetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: routeName.trim(), waypoints, routeCoords }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast({ title: "Route saved!", description: "The route is now visible to all drivers and commuters." });
      setBuilding(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoute() {
    setDeleting(true);
    try {
      await fetch(`/api/routes/fleet/${fleetId}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast({ title: "Route deleted" });
      setWaypoints([]);
      setRouteCoords([]);
      setBuilding(true);
      onDeleted();
    } catch {
      toast({ title: "Error deleting route", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="route-name" className="text-xs text-muted-foreground mb-1 block">Route Name</Label>
          <Input
            id="route-name"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="e.g. Calauag to Lopez"
            className="h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end">
          {building && (
            <>
              <Button size="sm" variant="outline" onClick={undoLast} disabled={waypoints.length === 0} className="h-8">
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
              </Button>
              <Button size="sm" variant="outline" onClick={clearAll} disabled={waypoints.length === 0} className="h-8 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
              <Button size="sm" onClick={saveRoute} disabled={saving || snapping || waypoints.length < 2} className="h-8 bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Route
              </Button>
            </>
          )}
          {!building && (
            <>
              <Button size="sm" variant="outline" onClick={() => setBuilding(true)} className="h-8">
                <Route className="h-3.5 w-3.5 mr-1" /> Edit Route
              </Button>
              <Button size="sm" variant="outline" onClick={deleteRoute} disabled={deleting} className="h-8 text-destructive hover:text-destructive">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        {building && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-white/95 shadow rounded-full px-3 py-1.5 text-xs font-semibold text-orange-600 border border-orange-200">
            <MapPin className="h-3.5 w-3.5" />
            Click on the map to place route pins
            {snapping && <Loader2 className="h-3 w-3 animate-spin ml-1 text-muted-foreground" />}
          </div>
        )}
        {waypoints.length > 0 && (
          <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5">
            <Badge variant="outline" className="bg-white/95 text-orange-600 border-orange-200 text-xs">
              {waypoints.length} pin{waypoints.length !== 1 ? "s" : ""}
            </Badge>
            {snapping && (
              <Badge variant="outline" className="bg-white/95 text-muted-foreground text-xs gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Snapping…
              </Badge>
            )}
          </div>
        )}
        <div
          ref={mapContainerRef}
          className="w-full rounded-lg border border-border overflow-hidden"
          style={{ height: "380px" }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: ROUTE_COLOR }} />
          Route path (road-snapped)
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-primary/60" />
          Waypoint pin
        </div>
      </div>
    </div>
  );
}
