import { Router } from "express";
import { db, fleetRoutesTable, fleetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";
import { getIo } from "../socket";

const router = Router();

router.use(authMiddleware);

router.get("/routes/fleet/:fleetId", async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["fleetId"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleetId" }); return; }
  const rows = await db
    .select()
    .from(fleetRoutesTable)
    .where(eq(fleetRoutesTable.fleetId, fleetId));
  res.json(rows);
});

router.get("/routes/all", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(fleetRoutesTable);
  res.json(rows);
});

router.post("/routes/fleet/:fleetId", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["fleetId"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleetId" }); return; }

  const fleet = await db
    .select()
    .from(fleetsTable)
    .where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)))
    .limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Fleet not found or access denied" }); return; }

  const { name, waypoints, routeCoords } = req.body ?? {};
  if (!name || !Array.isArray(waypoints) || !Array.isArray(routeCoords)) {
    res.status(400).json({ error: "name, waypoints, and routeCoords are required" });
    return;
  }

  const [row] = await db
    .insert(fleetRoutesTable)
    .values({ fleetId, name, waypoints, routeCoords })
    .returning();

  const io = getIo();
  if (io) {
    io.emit("route:updated", { routeId: row.id, fleetId, name, routeCoords });
  }

  res.json(row);
});

router.put("/routes/:routeId", requireRole("admin"), async (req: AuthRequest, res) => {
  const routeId = parseInt(String(req.params["routeId"] ?? ""));
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid routeId" }); return; }

  const existing = await db
    .select({ fleetId: fleetRoutesTable.fleetId })
    .from(fleetRoutesTable)
    .where(eq(fleetRoutesTable.id, routeId))
    .limit(1);
  if (!existing.length) { res.status(404).json({ error: "Route not found" }); return; }

  const fleetId = existing[0]!.fleetId;
  const fleet = await db
    .select()
    .from(fleetsTable)
    .where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)))
    .limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Fleet not found or access denied" }); return; }

  const { name, waypoints, routeCoords } = req.body ?? {};
  if (!name || !Array.isArray(waypoints) || !Array.isArray(routeCoords)) {
    res.status(400).json({ error: "name, waypoints, and routeCoords are required" });
    return;
  }

  const [row] = await db
    .update(fleetRoutesTable)
    .set({ name, waypoints, routeCoords, updatedAt: new Date() })
    .where(eq(fleetRoutesTable.id, routeId))
    .returning();

  const io = getIo();
  if (io) {
    io.emit("route:updated", { routeId: row!.id, fleetId: row!.fleetId, name: row!.name, routeCoords: row!.routeCoords });
  }

  res.json(row);
});

router.delete("/routes/:routeId", requireRole("admin"), async (req: AuthRequest, res) => {
  const routeId = parseInt(String(req.params["routeId"] ?? ""));
  if (isNaN(routeId)) { res.status(400).json({ error: "Invalid routeId" }); return; }

  const existing = await db
    .select({ fleetId: fleetRoutesTable.fleetId })
    .from(fleetRoutesTable)
    .where(eq(fleetRoutesTable.id, routeId))
    .limit(1);
  if (!existing.length) { res.status(404).json({ error: "Route not found" }); return; }

  const fleetId = existing[0]!.fleetId;
  const fleet = await db
    .select()
    .from(fleetsTable)
    .where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)))
    .limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Fleet not found or access denied" }); return; }

  await db.delete(fleetRoutesTable).where(eq(fleetRoutesTable.id, routeId));

  const io = getIo();
  if (io) io.emit("route:removed", { routeId, fleetId });

  res.json({ success: true });
});

export default router;
