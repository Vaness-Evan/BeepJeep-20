import { Router } from "express";
import { db, fareSettingsTable, fleetsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";
import { getIo } from "../socket";

const router = Router();
router.use(authMiddleware);

router.get("/fare-settings", requireRole("fleet_driver", "admin"), async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const defaults = { regularFare: 13, studentFare: 10, seniorFare: 10 };

    if (user.role === "fleet_driver" && user.fleetId) {
      const [setting] = await db
        .select()
        .from(fareSettingsTable)
        .where(and(eq(fareSettingsTable.ownerId, user.fleetId), eq(fareSettingsTable.ownerType, "fleet")))
        .limit(1);
      if (!setting) return res.json(defaults);
      return res.json({
        regularFare: parseFloat(String(setting.regularFare)),
        studentFare: parseFloat(String(setting.studentFare)),
        seniorFare: parseFloat(String(setting.seniorFare)),
      });
    }

    const fleetId = parseInt(req.query["fleetId"] as string ?? "");
    if (!isNaN(fleetId)) {
      const [setting] = await db
        .select()
        .from(fareSettingsTable)
        .where(and(eq(fareSettingsTable.ownerId, fleetId), eq(fareSettingsTable.ownerType, "fleet")))
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
    const { regularFare, studentFare, seniorFare, fleetId } = req.body ?? {};

    if (regularFare === undefined || studentFare === undefined || seniorFare === undefined) {
      res.status(400).json({ error: "regularFare, studentFare, seniorFare are required" });
      return;
    }

    if (!fleetId) {
      res.status(400).json({ error: "fleetId is required" });
      return;
    }

    const fleet = await db
      .select({ id: fleetsTable.id })
      .from(fleetsTable)
      .where(and(eq(fleetsTable.id, Number(fleetId)), eq(fleetsTable.adminId, user.id)))
      .limit(1);

    if (!fleet.length) {
      res.status(403).json({ error: "Fleet not found" });
      return;
    }

    const existing = await db
      .select({ id: fareSettingsTable.id })
      .from(fareSettingsTable)
      .where(and(eq(fareSettingsTable.ownerId, Number(fleetId)), eq(fareSettingsTable.ownerType, "fleet")))
      .limit(1);

    if (existing.length) {
      await db
        .update(fareSettingsTable)
        .set({ regularFare: String(regularFare), studentFare: String(studentFare), seniorFare: String(seniorFare), updatedAt: new Date() })
        .where(eq(fareSettingsTable.id, existing[0].id));
    } else {
      await db.insert(fareSettingsTable).values({
        ownerId: Number(fleetId),
        ownerType: "fleet",
        regularFare: String(regularFare),
        studentFare: String(studentFare),
        seniorFare: String(seniorFare),
      });
    }
    getIo()?.emit("fleet:fare_updated", {
      fleetId: Number(fleetId),
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
