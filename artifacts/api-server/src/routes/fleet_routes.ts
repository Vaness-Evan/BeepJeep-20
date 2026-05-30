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
  res.json(rows[0] ?? null);
});

router.get("/routes/all", async (_req: AuthRequest, res) => {
  const rows = await db.select().from(fleetRoutesTable);
  res.json(rows);
});

router.put("/routes/fleet/:fleetId", requireRole("admin"), async (req: AuthRequest, res) => {
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

  const existing = await db
    .select({ id: fleetRoutesTable.id })
    .from(fleetRoutesTable)
    .where(eq(fleetRoutesTable.fleetId, fleetId))
    .limit(1);

  let row;
  if (existing.length) {
    [row] = await db
      .update(fleetRoutesTable)
      .set({ name, waypoints, routeCoords, updatedAt: new Date() })
      .where(eq(fleetRoutesTable.fleetId, fleetId))
      .returning();
  } else {
    [row] = await db
      .insert(fleetRoutesTable)
      .values({ fleetId, name, waypoints, routeCoords })
      .returning();
  }

  const io = getIo();
  if (io) {
    io.emit("route:updated", { fleetId, name, routeCoords });
  }

  res.json(row);
});

router.delete("/routes/fleet/:fleetId", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["fleetId"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleetId" }); return; }

  const fleet = await db
    .select()
    .from(fleetsTable)
    .where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)))
    .limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Fleet not found or access denied" }); return; }

  await db.delete(fleetRoutesTable).where(eq(fleetRoutesTable.fleetId, fleetId));

  const io = getIo();
  if (io) io.emit("route:removed", { fleetId });

  res.json({ success: true });
});

export default router;
