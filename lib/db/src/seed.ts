import { db, usersTable } from "./index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, "admin"))
    .limit(1);

  if (existing.length > 0) {
    console.log("Admin user already exists — skipping.");
  } else {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      name: "System Admin",
      role: "admin",
      fleetId: null,
    });
    console.log("Created admin user  username=admin  password=admin123");
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
