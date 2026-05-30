import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQueries } from "@tanstack/react-query";
import { useGetFleets, getFleetDrivers, getGetFleetDriversQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wifi, WifiOff, Bus, Users, Navigation } from "lucide-react";

interface DriverData {
  driverId: string;
  driverName: string;
  lat: number;
  lng: number;
  status: "available" | "full" | "offline";
  route: string;
  passengerCount: number;
  totalFare: number;
  lastUpdated: number;
  fleetName?: string;
}

const STATUS_COLOR: Record<string, string> = {
  available: "#22c55e",
  full: "#ef4444",
  offline: "#94a3b8",
};

function buildMarkerHtml(status: DriverData["status"]) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.offline;
  return `
    <div style="position:relative;width:32px;height:32px;">
      <div style="
        position:absolute;inset:0;
        background:${color};
        border-radius:50% 50% 50% 4px;
        transform:rotate(-45deg);
        border:2px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,.35);
      "></div>
      <div style="
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;
      ">🚌</div>
    </div>`;
}

function makeIcon(status: DriverData["status"]) {
  return L.divIcon({
    html: buildMarkerHtml(status),
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 28],
    popupAnchor: [0, -30],
  });
}

function buildPopup(driver: DriverData): string {
  const statusLabel =
    driver.status === "available"
      ? "Available"
      : driver.status === "full"
      ? "Full"
      : "Offline";
  return `
    <div style="font-family:system-ui,sans-serif;min-width:180px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${driver.driverName}</div>
      ${driver.route ? `<div style="font-size:12px;color:#64748b;margin-bottom:6px;">Route: ${driver.route}</div>` : ""}
      ${driver.fleetName ? `<div style="font-size:12px;color:#64748b;margin-bottom:6px;">Fleet: ${driver.fleetName}</div>` : ""}
      <div style="display:flex;gap:12px;font-size:12px;margin-top:4px;">
        <span><b>${driver.passengerCount}</b> passengers</span>
        <span><b>₱${driver.totalFare.toFixed(2)}</b> today</span>
      </div>
      <div style="margin-top:6px;font-size:11px;font-weight:600;color:${STATUS_COLOR[driver.status] ?? STATUS_COLOR.offline};">${statusLabel}</div>
    </div>`;
}

// Philippines default center (Manila area)
const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842];
const DEFAULT_ZOOM = 13;

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [drivers, setDrivers] = useState<Map<string, DriverData>>(new Map());
  // null = still loading; Set = loaded (may be empty if no fleets)
  const [fleetDriverIds, setFleetDriverIds] = useState<Set<string> | null>(null);

  // Load all fleets
  const { data: fleets, isSuccess: fleetsLoaded } = useGetFleets();

  // Dynamically fetch drivers for every fleet using useQueries
  const fleetIds = fleetsLoaded && fleets ? fleets.map((f) => f.id) : [];

  const fleetDriverQueries = useQueries({
    queries: fleetIds.map((fleetId) => ({
      queryKey: getGetFleetDriversQueryKey(fleetId),
      queryFn: () => getFleetDrivers(fleetId),
    })),
  });

  // Build the allowed set once all fleet driver queries have settled
  useEffect(() => {
    if (!fleetsLoaded) return;
    if (fleetIds.length === 0) {
      // Admin has no fleets → show nothing
      setFleetDriverIds(new Set());
      return;
    }
    const allSettled = fleetDriverQueries.every((q) => q.isSuccess || q.isError);
    if (!allSettled) return;

    const ids = new Set<string>();
    fleetDriverQueries.forEach((q) => {
      if (q.isSuccess && q.data) {
        q.data.forEach((d) => ids.add(String(d.id)));
      }
    });
    setFleetDriverIds(ids);
  }, [fleetsLoaded, fleetIds.length, fleetDriverQueries]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map markers whenever driver data or the allowed-ID set changes
  const updateMarkers = useCallback(
    (driversMap: Map<string, DriverData>, filterIds: Set<string> | null) => {
      const map = mapRef.current;
      if (!map) return;
      // Don't render anything until we know which IDs are allowed
      if (filterIds === null) return;

      const visibleIds = new Set<string>();

      driversMap.forEach((driver, id) => {
        if (!filterIds.has(id)) return;
        visibleIds.add(id);

        const existing = markersRef.current.get(id);
        if (existing) {
          existing.setLatLng([driver.lat, driver.lng]);
          existing.setIcon(makeIcon(driver.status));
          existing.getPopup()?.setContent(buildPopup(driver));
        } else {
          const marker = L.marker([driver.lat, driver.lng], {
            icon: makeIcon(driver.status),
          })
            .bindPopup(buildPopup(driver), { maxWidth: 240 })
            .addTo(map);
          markersRef.current.set(id, marker);
        }
      });

      // Remove markers for drivers no longer visible
      markersRef.current.forEach((marker, id) => {
        if (!visibleIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });
    },
    []
  );

  useEffect(() => {
    updateMarkers(drivers, fleetDriverIds);
  }, [drivers, fleetDriverIds, updateMarkers]);

  // Socket.io connection
  useEffect(() => {
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("get:drivers");
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("drivers:all", (data: DriverData[]) => {
      setDrivers(new Map(data.map((d) => [d.driverId, d])));
    });

    socket.on("driver:location", (data: DriverData) => {
      setDrivers((prev) => {
        const next = new Map(prev);
        next.set(data.driverId, data);
        return next;
      });
    });

    socket.on("driver:status", (data: { driverId: string; status: DriverData["status"] }) => {
      setDrivers((prev) => {
        const driver = prev.get(data.driverId);
        if (!driver) return prev;
        const next = new Map(prev);
        next.set(data.driverId, { ...driver, status: data.status });
        return next;
      });
    });

    socket.on(
      "driver:fare",
      (data: { driverId: string; passengerCount: number; totalFare: number }) => {
        setDrivers((prev) => {
          const driver = prev.get(data.driverId);
          if (!driver) return prev;
          const next = new Map(prev);
          next.set(data.driverId, {
            ...driver,
            passengerCount: data.passengerCount,
            totalFare: data.totalFare,
          });
          return next;
        });
      }
    );

    socket.on("driver:offline", (data: { driverId: string }) => {
      setDrivers((prev) => {
        const next = new Map(prev);
        next.delete(data.driverId);
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Derived stats — only for this admin's fleet drivers; null while IDs are loading
  const visibleDrivers =
    fleetDriverIds !== null
      ? Array.from(drivers.values()).filter((d) => fleetDriverIds.has(d.driverId))
      : [];

  const activeCount = visibleDrivers.length;
  const fullCount = visibleDrivers.filter((d) => d.status === "full").length;
  const totalPassengers = visibleDrivers.reduce((s, d) => s + d.passengerCount, 0);
  const idsLoaded = fleetDriverIds !== null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Live Map</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time locations of your fleet drivers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge
              variant="outline"
              className="text-emerald-600 border-emerald-200 bg-emerald-50 gap-1.5"
            >
              <Wifi className="h-3 w-3" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground gap-1.5">
              <WifiOff className="h-3 w-3" />
              Connecting…
            </Badge>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Bus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Active</div>
              <div className="text-lg font-extrabold" data-testid="stat-active-drivers">
                {idsLoaded ? activeCount : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <Navigation className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Full</div>
              <div className="text-lg font-extrabold" data-testid="stat-full-drivers">
                {idsLoaded ? fullCount : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Riders</div>
              <div className="text-lg font-extrabold" data-testid="stat-total-riders">
                {idsLoaded ? totalPassengers : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        {[
          { color: "#22c55e", label: "Available" },
          { color: "#ef4444", label: "Full" },
          { color: "#94a3b8", label: "Offline" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Map */}
      <div
        ref={mapContainerRef}
        className="w-full rounded-xl overflow-hidden border border-border shadow-sm"
        style={{ height: "520px" }}
        data-testid="map-container"
      />

      {idsLoaded && activeCount === 0 && connected && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          No active drivers from your fleets are online right now.
        </p>
      )}
    </div>
  );
}
