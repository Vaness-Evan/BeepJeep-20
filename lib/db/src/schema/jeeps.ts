import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const jeepsTable = pgTable("jeeps", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull(),
  vehicleNumber: text("vehicle_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Jeep = typeof jeepsTable.$inferSelect;
