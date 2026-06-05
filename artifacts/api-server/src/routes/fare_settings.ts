import { Router } from "express";
import { db, fareSettingsTable, fleetsTable, fleetRoutesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";
import { getIo } from "../socket";

const router = Router();
router.use(authMiddleware);

router.get("/fare-settings", requireRole("fleet_driver", "admin"), async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const defaults = { regularFare: 13, studentFare: 10, seniorFare: 10 };

    const routeId = parseInt(req.query["routeId"] as string ?? "");
    if (!isNaN(routeId)) {
      const [setting] = await db
        .select()
        .from(fareSettingsTable)
        .where(and(eq(fareSettingsTable.ownerId, routeId), eq(fareSettingsTable.ownerType, "route")))
        .limit(1);
      if (!setting) return res.json(defaults);
      return res.json({
        regularFare: parseFloat(String(setting.regularFare)),
        studentFare: parseFloat(String(setting.studentFare)),
        seniorFare: parseFloat(String(setting.seniorFare)),
      });
    }

    if (user.role === "fleet_driver" && user.routeId) {
      const [setting] = await db
        .select()
        .from(fareSettingsTable)
        .where(and(eq(fareSettingsTable.ownerId, user.routeId), eq(fareSettingsTable.ownerType, "route")))
        .limit(1);
      if (!setting) return res.json(defaults);
      return res.json({
        regularFare: parseFloat(String(setting.regularFare)),
        studentFare: parseFloat(String(setting.studentFare)),
        seniorFare: parseFloat(String(setting.seniorFare)),
      });
    }

    return res.json(defaults);
  } catch (err) {
    next(err);
  }
});

router.put("/fare-settings", requireRole("admin"), async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const { regularFare, studentFare, seniorFare, routeId } = req.body ?? {};

    if (regularFare === undefined || studentFare === undefined || seniorFare === undefined) {
      res.status(400).json({ error: "regularFare, studentFare, seniorFare are required" });
      return;
    }

    if (!routeId) {
      res.status(400).json({ error: "routeId is required" });
      return;
    }

    const route = await db
      .select({ id: fleetRoutesTable.id, fleetId: fleetRoutesTable.fleetId })
      .from(fleetRoutesTable)
      .where(eq(fleetRoutesTable.id, Number(routeId)))
      .limit(1);

    if (!route.length) {
      res.status(404).json({ error: "Route not found" });
      return;
    }

    const fleet = await db
      .select({ id: fleetsTable.id })
      .from(fleetsTable)
      .where(and(eq(fleetsTable.id, route[0]!.fleetId), eq(fleetsTable.adminId, user.id)))
      .limit(1);

    if (!fleet.length) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const existing = await db
      .select({ id: fareSettingsTable.id })
      .from(fareSettingsTable)
      .where(and(eq(fareSettingsTable.ownerId, Number(routeId)), eq(fareSettingsTable.ownerType, "route")))
      .limit(1);

    if (existing.length) {
      await db
        .update(fareSettingsTable)
        .set({ regularFare: String(regularFare), studentFare: String(studentFare), seniorFare: String(seniorFare), updatedAt: new Date() })
        .where(eq(fareSettingsTable.id, existing[0]!.id));
    } else {
      await db.insert(fareSettingsTable).values({
        ownerId: Number(routeId),
        ownerType: "route",
        regularFare: String(regularFare),
        studentFare: String(studentFare),
        seniorFare: String(seniorFare),
      });
    }

    getIo()?.emit("route:fare_updated", {
      routeId: Number(routeId),
      regularFare,
      studentFare,
      seniorFare,
    });
    return res.json({ regularFare, studentFare, seniorFare });
  } catch (err) {
    next(err);
  }
});

export default router;
