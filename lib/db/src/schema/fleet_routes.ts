import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const waypointSchema = z.object({ lat: z.number(), lng: z.number() });
export type Waypoint = z.infer<typeof waypointSchema>;

export const fleetRoutesTable = pgTable("fleet_routes", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().unique(),
  name: text("name").notNull(),
  waypoints: jsonb("waypoints").notNull().$type<Waypoint[]>(),
  routeCoords: jsonb("route_coords").notNull().$type<Waypoint[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FleetRoute = typeof fleetRoutesTable.$inferSelect;
