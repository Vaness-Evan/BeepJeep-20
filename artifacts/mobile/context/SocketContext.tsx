import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { DriverData } from "@/types";

export interface CommuterLocation {
  commuterId: string;
  commuterName: string;
  lat: number;
  lng: number;
  announcedAt: number;
}

export interface RouteUpdate {
  fleetId: number;
  name: string;
  routeCoords: { lat: number; lng: number }[];
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  drivers: DriverData[];
  commuterLocations: CommuterLocation[];
  routeUpdates: RouteUpdate[];
  removedFleetIds: number[];
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  drivers: [],
  commuterLocations: [],
  routeUpdates: [],
  removedFleetIds: [],
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [commuterLocations, setCommuterLocations] = useState<CommuterLocation[]>([]);
  const [routeUpdates, setRouteUpdates] = useState<RouteUpdate[]>([]);
  const [removedFleetIds, setRemovedFleetIds] = useState<number[]>([]);

  useEffect(() => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url = domain ? `https://${domain}` : "http://localhost:8080";

    const socket = io(url, {
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
      setDrivers(data);
    });

    socket.on("driver:location", (data: DriverData) => {
      setDrivers((prev) => {
        const idx = prev.findIndex((d) => d.driverId === data.driverId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
    });

    socket.on("driver:status", (data: { driverId: string; status: DriverData["status"] }) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.driverId === data.driverId ? { ...d, status: data.status } : d
        )
      );
    });

    socket.on("driver:fare", (data: { driverId: string; passengerCount: number; totalFare: number }) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.driverId === data.driverId
            ? { ...d, passengerCount: data.passengerCount, totalFare: data.totalFare }
            : d
        )
      );
    });

    socket.on("driver:offline", (data: { driverId: string }) => {
      setDrivers((prev) => prev.filter((d) => d.driverId !== data.driverId));
    });

    socket.on("commuter:location", (data: CommuterLocation) => {
      setCommuterLocations((prev) => {
        const idx = prev.findIndex((c) => c.commuterId === data.commuterId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
    });

    socket.on("commuter:removed", (data: { commuterId: string }) => {
      setCommuterLocations((prev) => prev.filter((c) => c.commuterId !== data.commuterId));
    });

    socket.on("route:updated", (data: RouteUpdate) => {
      setRouteUpdates((prev) => {
        const idx = prev.findIndex((r) => r.fleetId === data.fleetId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
      setRemovedFleetIds((prev) => prev.filter((id) => id !== data.fleetId));
    });

    socket.on("route:removed", (data: { fleetId: number }) => {
      setRouteUpdates((prev) => prev.filter((r) => r.fleetId !== data.fleetId));
      setRemovedFleetIds((prev) => [...prev, data.fleetId]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      connected,
      drivers,
      commuterLocations,
      routeUpdates,
      removedFleetIds,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
