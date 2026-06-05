import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, fleetsTable, usersTable, jeepsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.use(authMiddleware);

// Create fleet
router.post("/fleets", requireRole("admin"), async (req: AuthRequest, res) => {
  const { name } = req.body ?? {};
  if (!name?.trim()) {
    res.status(400).json({ error: "Fleet name is required" });
    return;
  }
  const [fleet] = await db
    .insert(fleetsTable)
    .values({ name: name.trim(), adminId: req.user!.id })
    .returning();
  res.status(201).json(fleet);
});

// List admin's fleets with jeep counts
router.get("/fleets", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleets = await db
    .select()
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));

  const withCounts = await Promise.all(
    fleets.map(async (f) => {
      const jeeps = await db
        .select({ id: jeepsTable.id })
        .from(jeepsTable)
        .where(eq(jeepsTable.fleetId, f.id));
      return { ...f, jeepCount: jeeps.length, driverCount: jeeps.length };
    })
  );

  res.json(withCounts);
});

// Get jeeps in a fleet (with assigned driver info)
router.get("/fleets/:id/jeeps", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const jeeps = await db
    .select()
    .from(jeepsTable)
    .where(eq(jeepsTable.fleetId, fleetId));

  const jeepsWithDrivers = await Promise.all(
    jeeps.map(async (jeep) => {
      const [driver] = await db
        .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, route: usersTable.route })
        .from(usersTable)
        .where(and(eq(usersTable.jeepId, jeep.id), eq(usersTable.role, "fleet_driver")))
        .limit(1);
      return { ...jeep, driver: driver ?? null };
    })
  );

  res.json(jeepsWithDrivers);
});

// Create jeep in a fleet
router.post("/fleets/:id/jeeps", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const { vehicleNumber } = req.body ?? {};
  if (!vehicleNumber?.trim()) {
    res.status(400).json({ error: "Vehicle number is required" });
    return;
  }

  const [jeep] = await db
    .insert(jeepsTable)
    .values({ fleetId, vehicleNumber: vehicleNumber.trim() })
    .returning();

  res.status(201).json({ ...jeep, driver: null });
});

// Get unassigned drivers in a fleet (fleet_driver users with no jeep assigned)
router.get("/fleets/:id/unassigned-drivers", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const drivers = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username })
    .from(usersTable)
    .where(and(
      eq(usersTable.fleetId, fleetId),
      eq(usersTable.role, "fleet_driver"),
      isNull(usersTable.jeepId)
    ));

  res.json(drivers);
});

// Assign a driver to a jeep (existing driver OR create new one)
router.post("/jeeps/:jeepId/assign-driver", requireRole("admin"), async (req: AuthRequest, res) => {
  const jeepId = parseInt(String(req.params["jeepId"] ?? ""));
  if (isNaN(jeepId)) { res.status(400).json({ error: "Invalid jeep id" }); return; }

  const [jeep] = await db.select().from(jeepsTable).where(eq(jeepsTable.id, jeepId)).limit(1);
  if (!jeep) { res.status(404).json({ error: "Jeep not found" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, jeep.fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Forbidden" }); return; }

  const { driverId, name, username, password } = req.body ?? {};

  if (driverId) {
    const id = parseInt(String(driverId));
    await db.update(usersTable)
      .set({ jeepId })
      .where(and(eq(usersTable.id, id), eq(usersTable.fleetId, jeep.fleetId)));

    const [driver] = await db
      .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, route: usersTable.route })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    res.json({ jeepId, driver: driver ?? null });
  } else if (name && username && password) {
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (existing.length) { res.status(409).json({ error: "Username already taken" }); return; }

    const passwordHash = await bcrypt.hash(password, 10);
    const [driver] = await db.insert(usersTable).values({
      name, username, passwordHash,
      role: "fleet_driver",
      fleetId: jeep.fleetId,
      jeepId,
    }).returning({ id: usersTable.id, name: usersTable.name, username: usersTable.username, route: usersTable.route });

    res.status(201).json({ jeepId, driver });
  } else {
    res.status(400).json({ error: "Provide either driverId or name/username/password to create a new driver" });
  }
});

// Unassign driver from a jeep
router.delete("/jeeps/:jeepId/driver", requireRole("admin"), async (req: AuthRequest, res) => {
  const jeepId = parseInt(String(req.params["jeepId"] ?? ""));
  if (isNaN(jeepId)) { res.status(400).json({ error: "Invalid jeep id" }); return; }

  const [jeep] = await db.select().from(jeepsTable).where(eq(jeepsTable.id, jeepId)).limit(1);
  if (!jeep) { res.status(404).json({ error: "Jeep not found" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, jeep.fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(usersTable).set({ jeepId: null }).where(eq(usersTable.jeepId, jeepId));
  res.json({ success: true });
});

// Delete jeep (unassigns driver too)
router.delete("/jeeps/:jeepId", requireRole("admin"), async (req: AuthRequest, res) => {
  const jeepId = parseInt(String(req.params["jeepId"] ?? ""));
  if (isNaN(jeepId)) { res.status(400).json({ error: "Invalid jeep id" }); return; }

  const [jeep] = await db.select().from(jeepsTable).where(eq(jeepsTable.id, jeepId)).limit(1);
  if (!jeep) { res.status(404).json({ error: "Jeep not found" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, jeep.fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(usersTable).set({ jeepId: null }).where(eq(usersTable.jeepId, jeepId));
  await db.delete(jeepsTable).where(eq(jeepsTable.id, jeepId));
  res.json({ success: true });
});

// Get all drivers in a fleet
router.get("/fleets/:id/drivers", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const drivers = await db
    .select({ id: usersTable.id, name: usersTable.name, username: usersTable.username, vehicleNumber: usersTable.vehicleNumber, route: usersTable.route, jeepId: usersTable.jeepId, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(and(eq(usersTable.fleetId, fleetId), eq(usersTable.role, "fleet_driver")));

  res.json(drivers);
});

// Add a driver to a fleet (without assigning to a jeepney)
router.post("/fleets/:id/drivers", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  const { name, username, password } = req.body ?? {};
  if (!name?.trim() || !username?.trim() || !password) {
    res.status(400).json({ error: "name, username, and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing.length) { res.status(409).json({ error: "Username already taken" }); return; }

  const passwordHash = await bcrypt.hash(password, 10);
  const [driver] = await db.insert(usersTable).values({
    name: name.trim(), username: username.trim(), passwordHash,
    role: "fleet_driver",
    fleetId,
  }).returning({ id: usersTable.id, name: usersTable.name, username: usersTable.username, route: usersTable.route, jeepId: usersTable.jeepId, createdAt: usersTable.createdAt });

  res.status(201).json(driver);
});

// Remove a driver from fleet (delete their account)
router.delete("/fleets/:id/drivers/:driverId", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  const driverId = parseInt(String(req.params["driverId"] ?? ""));
  if (isNaN(fleetId) || isNaN(driverId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const fleet = await db.select().from(fleetsTable).where(
    and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id))
  ).limit(1);
  if (!fleet.length) { res.status(404).json({ error: "Fleet not found" }); return; }

  await db.delete(usersTable).where(
    and(eq(usersTable.id, driverId), eq(usersTable.fleetId, fleetId), eq(usersTable.role, "fleet_driver"))
  );
  res.json({ success: true });
});

// Delete fleet
router.delete("/fleets/:id", requireRole("admin"), async (req: AuthRequest, res) => {
  const fleetId = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(fleetId)) { res.status(400).json({ error: "Invalid fleet id" }); return; }

  await db.update(usersTable).set({ jeepId: null }).where(
    and(eq(usersTable.fleetId, fleetId), eq(usersTable.role, "fleet_driver"))
  );
  await db.delete(jeepsTable).where(eq(jeepsTable.fleetId, fleetId));
  await db.delete(fleetsTable).where(and(eq(fleetsTable.id, fleetId), eq(fleetsTable.adminId, req.user!.id)));
  res.json({ success: true });
});

export default router;
