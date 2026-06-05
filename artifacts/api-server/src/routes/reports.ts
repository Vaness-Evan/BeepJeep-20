import { Router } from "express";
import * as XLSX from "xlsx";
import { db, fareRecordsTable, usersTable, fleetsTable } from "@workspace/db";
import { eq, gte, and, inArray, sql } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/reports/export", authMiddleware, requireRole("admin"), async (req: AuthRequest, res) => {
  const format = (req.query["format"] as string) ?? "xlsx";
  const days = parseInt((req.query["days"] as string) ?? "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const adminFleets = await db
    .select({ id: fleetsTable.id, name: fleetsTable.name })
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));
  const fleetIds = adminFleets.map((f) => f.id);
  const fleetNameMap = Object.fromEntries(adminFleets.map((f) => [f.id, f.name]));

  const records = fleetIds.length > 0
    ? await db
        .select()
        .from(fareRecordsTable)
        .where(and(gte(fareRecordsTable.createdAt, since), inArray(fareRecordsTable.fleetId, fleetIds)))
        .orderBy(fareRecordsTable.createdAt)
    : [];

  const rows = records.map((r) => ({
    Date: r.createdAt.toISOString().split("T")[0],
    Time: r.createdAt.toTimeString().split(" ")[0],
    Fleet: fleetNameMap[r.fleetId ?? 0] ?? "Independent",
    Driver: r.driverName,
    "Driver ID": r.driverId,
    "Passenger Type": r.passengerType.charAt(0).toUpperCase() + r.passengerType.slice(1),
    "Amount (₱)": parseFloat(String(r.amount)),
  }));

  const totalFare = rows.reduce((s, r) => s + r["Amount (₱)"], 0);
  const regularCount = rows.filter((r) => r["Passenger Type"] === "Regular").length;
  const studentCount = rows.filter((r) => r["Passenger Type"] === "Student").length;
  const seniorCount = rows.filter((r) => r["Passenger Type"] === "Senior").length;

  const summaryRows = [
    { Field: "Report Period", Value: `Last ${days} days` },
    { Field: "Generated At", Value: new Date().toLocaleString() },
    { Field: "Admin", Value: req.user!.name },
    { Field: "Total Fleets", Value: fleetIds.length },
    { Field: "Total Fare Records", Value: rows.length },
    { Field: "Total Fare Collected (₱)", Value: totalFare.toFixed(2) },
    { Field: "Average Fare per Trip (₱)", Value: rows.length ? (totalFare / rows.length).toFixed(2) : "0.00" },
    { Field: "Regular Passengers", Value: regularCount },
    { Field: "Student Passengers", Value: studentCount },
    { Field: "Senior Passengers", Value: seniorCount },
  ];

  // Per-fleet breakdown
  const fleetBreakdown = adminFleets.map((fleet) => {
    const fr = rows.filter((r) => r["Fleet"] === fleet.name);
    const fare = fr.reduce((s, r) => s + r["Amount (₱)"], 0);
    return {
      Fleet: fleet.name,
      "Total Trips": fr.length,
      "Total Fare (₱)": fare.toFixed(2),
      "Regular": fr.filter((r) => r["Passenger Type"] === "Regular").length,
      "Student": fr.filter((r) => r["Passenger Type"] === "Student").length,
      "Senior": fr.filter((r) => r["Passenger Type"] === "Senior").length,
    };
  });

  // Per-driver breakdown
  const driverMap: Record<string, { trips: number; fare: number }> = {};
  for (const r of rows) {
    if (!driverMap[r["Driver"]]) driverMap[r["Driver"]] = { trips: 0, fare: 0 };
    driverMap[r["Driver"]]!.trips++;
    driverMap[r["Driver"]]!.fare += r["Amount (₱)"];
  }
  const driverBreakdown = Object.entries(driverMap)
    .map(([driver, s]) => ({
      Driver: driver,
      "Total Trips": s.trips,
      "Total Fare (₱)": s.fare.toFixed(2),
      "Avg Fare (₱)": s.trips ? (s.fare / s.trips).toFixed(2) : "0.00",
    }))
    .sort((a, b) => parseFloat(b["Total Fare (₱)"]) - parseFloat(a["Total Fare (₱)"]));

  // Daily trend
  const dailyMap: Record<string, { trips: number; fare: number }> = {};
  for (const r of rows) {
    const d = r["Date"] as string;
    if (!dailyMap[d]) dailyMap[d] = { trips: 0, fare: 0 };
    dailyMap[d]!.trips++;
    dailyMap[d]!.fare += r["Amount (₱)"];
  }
  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({
      Date: date,
      "Trips": s.trips,
      "Fare (₱)": s.fare.toFixed(2),
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records in range" }]), "Fare Records");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fleetBreakdown.length ? fleetBreakdown : [{ Note: "No fleet data" }]), "Fleet Breakdown");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(driverBreakdown.length ? driverBreakdown : [{ Note: "No driver data" }]), "Driver Breakdown");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyTrend.length ? dailyTrend : [{ Note: "No daily data" }]), "Daily Trend");

  if (format === "csv") {
    const wsRecords = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records in range" }]);
    const csv = XLSX.utils.sheet_to_csv(wsRecords);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="beepjeep-report-${Date.now()}.csv"`);
    res.send(csv);
    return;
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="beepjeep-report-${Date.now()}.xlsx"`);
  res.send(buf);
});

router.get("/reports/summary", authMiddleware, requireRole("admin"), async (req: AuthRequest, res) => {
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const adminFleets = await db
    .select({ id: fleetsTable.id, name: fleetsTable.name })
    .from(fleetsTable)
    .where(eq(fleetsTable.adminId, req.user!.id));
  const fleetIds = adminFleets.map((f) => f.id);

  const todayRecords = fleetIds.length > 0
    ? await db
        .select()
        .from(fareRecordsTable)
        .where(and(gte(fareRecordsTable.createdAt, today), inArray(fareRecordsTable.fleetId, fleetIds)))
    : [];

  const weekRecords = fleetIds.length > 0
    ? await db
        .select()
        .from(fareRecordsTable)
        .where(and(gte(fareRecordsTable.createdAt, sevenDaysAgo), inArray(fareRecordsTable.fleetId, fleetIds)))
    : [];

  const fleetDriverIds = fleetIds.length > 0
    ? (await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(inArray(usersTable.fleetId, fleetIds), eq(usersTable.role, "fleet_driver"))))
        .map((d) => d.id)
    : [];

  // Fleet breakdown for today
  const fleetBreakdown = adminFleets.map((fleet) => {
    const fr = todayRecords.filter((r) => r.fleetId === fleet.id);
    return {
      fleetId: fleet.id,
      fleetName: fleet.name,
      fare: fr.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      passengers: fr.length,
    };
  });

  // Daily trend for last 7 days
  const dailyMap: Record<string, { fare: number; passengers: number }> = {};
  for (const r of weekRecords) {
    const d = r.createdAt.toISOString().split("T")[0]!;
    if (!dailyMap[d]) dailyMap[d] = { fare: 0, passengers: 0 };
    dailyMap[d]!.fare += parseFloat(String(r.amount));
    dailyMap[d]!.passengers++;
  }
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split("T")[0]!;
    return { date: key, fare: dailyMap[key]?.fare ?? 0, passengers: dailyMap[key]?.passengers ?? 0 };
  });

  // Top drivers by fare (last 7 days)
  const driverMap: Record<number, { name: string; fare: number; trips: number }> = {};
  for (const r of weekRecords) {
    if (!driverMap[r.driverId]) driverMap[r.driverId] = { name: r.driverName, fare: 0, trips: 0 };
    driverMap[r.driverId]!.fare += parseFloat(String(r.amount));
    driverMap[r.driverId]!.trips++;
  }
  const topDrivers = Object.entries(driverMap)
    .map(([, s]) => s)
    .sort((a, b) => b.fare - a.fare)
    .slice(0, 5);

  const totalFareToday = todayRecords.reduce((s, r) => s + parseFloat(String(r.amount)), 0);
  const totalFareWeek = weekRecords.reduce((s, r) => s + parseFloat(String(r.amount)), 0);

  res.json({
    totalFareToday,
    totalFareWeek,
    totalPassengersToday: todayRecords.length,
    totalPassengersWeek: weekRecords.length,
    regularCount: todayRecords.filter((r) => r.passengerType === "regular").length,
    studentCount: todayRecords.filter((r) => r.passengerType === "student").length,
    seniorCount: todayRecords.filter((r) => r.passengerType === "senior").length,
    totalDrivers: fleetDriverIds.length,
    totalFleetDrivers: fleetDriverIds.length,
    totalFleets: fleetIds.length,
    fleetBreakdown,
    last7Days,
    topDrivers,
  });
});

export default router;
