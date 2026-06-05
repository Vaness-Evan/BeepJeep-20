import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, authMiddleware, type AuthRequest } from "../middlewares/auth";

const router = Router();

const SELF_REGISTER_ROLES = ["commuter", "admin"];

router.post("/auth/register", async (req: AuthRequest, res, next) => {
  try {
    const { username, password, name, role } = req.body ?? {};

    if (!username || !password || !name || !role) {
      res.status(400).json({ error: "username, password, name, and role are required" });
      return;
    }
    if (!SELF_REGISTER_ROLES.includes(role)) {
      res.status(400).json({ error: "Fleet drivers are created by an admin" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db
      .insert(usersTable)
      .values({ username, passwordHash, name, role, fleetId: null })
      .returning();

    const token = signToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      fleetId: user.fleetId ?? null,
    });

    res.status(201).json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/login", async (req: AuthRequest, res, next) => {
  try {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      fleetId: user.fleetId ?? null,
      routeId: user.routeId ?? null,
    });

    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role, fleetId: user.fleetId, routeId: user.routeId } });
  } catch (err) {
    next(err);
  }
});

router.get("/auth/me", authMiddleware, async (req: AuthRequest, res) => {
  const [fresh] = await db
    .select({ id: usersTable.id, username: usersTable.username, name: usersTable.name, role: usersTable.role, fleetId: usersTable.fleetId, route: usersTable.route, routeId: usersTable.routeId })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);
  res.json({ user: fresh ?? req.user });
});

export default router;
