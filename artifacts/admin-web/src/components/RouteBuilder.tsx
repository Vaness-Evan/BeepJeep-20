import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Trash2, Undo2, Save, Loader2, Route, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

interface Waypoint {
  lat: number;
  lng: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  fleetId: number;
  fleetName: string;
  existingRoute?: { name: string; waypoints: Waypoint[]; routeCoords: Waypoint[] } | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
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
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 4px;background:${ROUTE_COLOR};transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);font-size:11px;font-weight:700;color:white;">${index + 1}</span></div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 24],
    popupAnchor: [0, -26],
  });
}

export default function RouteBuilder({ fleetId, fleetName, existingRoute, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const { token } = useAuth();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [waypoints, setWaypoints] = useState<Waypoint[]>(existingRoute?.waypoints ?? []);
  const [routeCoords, setRouteCoords] = useState<Waypoint[]>(existingRoute?.routeCoords ?? []);
  const [routeName, setRouteName] = useState(existingRoute?.name ?? `${fleetName} Route`);
  const [snapping, setSnapping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [building, setBuilding] = useState(!existingRoute);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const snapRoute = useCallback(async (wps: Waypoint[]) => {
    if (wps.length < 2) { setRouteCoords([]); return; }
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
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !building) return;
    function onClick(e: L.LeafletMouseEvent) {
      const wp = { lat: e.latlng.lat, lng: e.latlng.lng };
      setWaypoints((prev) => { const next = [...prev, wp]; snapRoute(next); return next; });
    }
    map.on("click", onClick);
    map.getContainer().style.cursor = "crosshair";
    return () => { map.off("click", onClick); map.getContainer().style.cursor = ""; };
  }, [building, snapRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    waypoints.forEach((wp, i) => {
      const marker = L.marker([wp.lat, wp.lng], { icon: makePin(i) }).addTo(map).bindPopup(`Pin ${i + 1}`);
      markersRef.current.push(marker);
    });
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
    if (routeCoords.length > 1) {
      polylineRef.current = L.polyline(routeCoords.map((c) => [c.lat, c.lng] as [number, number]), {
        color: ROUTE_COLOR, weight: 5, opacity: 0.85, lineJoin: "round", lineCap: "round",
      }).addTo(map);
    }
  }, [routeCoords]);

  useEffect(() => {
    if (!existingRoute || !mapRef.current) return;
    const coords = existingRoute.routeCoords;
    if (coords.length < 2) return;
    mapRef.current.fitBounds(L.latLngBounds(coords.map((c) => [c.lat, c.lng])), { padding: [40, 40] });
  }, []);

  function searchPlaces(query: string) {
    if (!query.trim()) { setSearchResults([]); setShowResults(false); return; }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
        setShowResults(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  }

  function selectPlace(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    mapRef.current?.setView([lat, lng], 15);
    setSearchQuery(result.display_name.split(",")[0]);
    setShowResults(false);
    setSearchResults([]);
  }

  function undoLast() {
    setWaypoints((prev) => { const next = prev.slice(0, -1); snapRoute(next); return next; });
  }
  function clearAll() { setWaypoints([]); setRouteCoords([]); }

  async function saveRoute() {
    if (waypoints.length < 2) { toast({ title: "Place at least 2 pins", variant: "destructive" }); return; }
    if (!routeName.trim()) { toast({ title: "Route name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/routes/fleet/${fleetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name: routeName.trim(), waypoints, routeCoords }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast({ title: "Route saved!", description: "Drivers and commuters can now see this route on their maps." });
      setBuilding(false);
      onSaved();
    } catch (e: any) {
      toast({ title: "Error saving route", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoute() {
    setDeleting(true);
    try {
      await fetch(`/api/routes/fleet/${fleetId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      toast({ title: "Route deleted" });
      setWaypoints([]); setRouteCoords([]); setBuilding(true);
      onDeleted();
    } catch {
      toast({ title: "Error deleting route", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Top controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <Label htmlFor="route-name" className="text-xs text-muted-foreground mb-1 block">Route Name</Label>
          <Input id="route-name" value={routeName} onChange={(e) => setRouteName(e.target.value)}
            placeholder="e.g. Calauag to Lopez" className="h-8 text-sm" />
        </div>
        <div className="flex items-center gap-1.5 self-end">
          {building ? (
            <>
              <Button size="sm" variant="outline" onClick={undoLast} disabled={waypoints.length === 0} className="h-8">
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
              </Button>
              <Button size="sm" variant="outline" onClick={clearAll} disabled={waypoints.length === 0} className="h-8 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
              <Button size="sm" onClick={saveRoute} disabled={saving || snapping || waypoints.length < 2}
                className="h-8 bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Route
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setBuilding(true)} className="h-8">
                <Route className="h-3.5 w-3.5 mr-1" /> Edit Route
              </Button>
              <Button size="sm" variant="outline" onClick={deleteRoute} disabled={deleting}
                className="h-8 text-destructive hover:text-destructive">
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); searchPlaces(e.target.value); }}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            placeholder="Search for a place (e.g. Calauag, Quezon)…"
            className="h-8 text-sm pl-8 pr-7"
          />
          {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {searchQuery && !searching && (
            <button onClick={() => { setSearchQuery(""); setShowResults(false); setSearchResults([]); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-[2000] top-full mt-1 left-0 right-0 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
            {searchResults.map((r) => (
              <button key={r.place_id} onClick={() => selectPlace(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b border-border last:border-0 truncate">
                <span className="font-medium">{r.display_name.split(",")[0]}</span>
                <span className="text-muted-foreground text-xs ml-1.5">{r.display_name.split(",").slice(1, 3).join(",")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
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
        <div ref={mapContainerRef} className="w-full rounded-lg border border-border overflow-hidden" style={{ height: "360px" }} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: ROUTE_COLOR }} />
          Road-snapped route path
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-300" />
          Numbered waypoint pins
        </div>
      </div>
    </div>
  );
}
