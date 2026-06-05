import { Router } from "express";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { db, fareRecordsTable, usersTable, fleetsTable } from "@workspace/db";
import { eq, gte, and, inArray } from "drizzle-orm";
import { authMiddleware, requireRole, type AuthRequest } from "../middlewares/auth";

const router = Router();

const BRAND_GREEN = "FF16A34A";
const BRAND_GREEN_LIGHT = "FFD1FAE5";
const BRAND_ORANGE = "FFEA580C";
const BRAND_ORANGE_LIGHT = "FFFFEDD5";
const HEADER_BG = "FF1E293B";
const HEADER_FG = "FFFFFFFF";
const ROW_ALT = "FFF8FAFC";
const BORDER_COLOR = "FFE2E8F0";

function applyHeaderRow(row: ExcelJS.Row, bgColor = HEADER_BG, fgColor = HEADER_FG) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { bold: true, color: { argb: fgColor }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = {
      bottom: { style: "medium", color: { argb: BRAND_GREEN } },
    };
  });
  row.height = 22;
}

function applyDataRow(row: ExcelJS.Row, alt: boolean) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: alt ? ROW_ALT : "FFFFFFFF" },
    };
    cell.font = { size: 10, color: { argb: "FF334155" } };
    cell.alignment = { vertical: "middle" };
    cell.border = {
      bottom: { style: "hair", color: { argb: BORDER_COLOR } },
    };
  });
  row.height = 18;
}

function setCols(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns = widths.map((w) => ({ width: w }));
}

function addSheetTitle(ws: ExcelJS.Worksheet, title: string, colCount: number) {
  const titleRow = ws.addRow([title]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
  titleRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  titleRow.height = 30;

  const subRow = ws.addRow(["BeepJeep Fleet Management System"]);
  ws.mergeCells(subRow.number, 1, subRow.number, colCount);
  subRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN_LIGHT } };
  subRow.getCell(1).font = { italic: true, color: { argb: "FF166534" }, size: 9 };
  subRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  subRow.height = 16;

  ws.addRow([]);
}

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

  const records =
    fleetIds.length > 0
      ? await db
          .select()
          .from(fareRecordsTable)
          .where(and(gte(fareRecordsTable.createdAt, since), inArray(fareRecordsTable.fleetId, fleetIds)))
          .orderBy(fareRecordsTable.createdAt)
      : [];

  const rows = records.map((r) => ({
    date: r.createdAt.toISOString().split("T")[0]!,
    time: r.createdAt.toTimeString().split(" ")[0]!,
    fleet: fleetNameMap[r.fleetId ?? 0] ?? "Independent",
    driver: r.driverName,
    driverId: r.driverId,
    passengerType: r.passengerType.charAt(0).toUpperCase() + r.passengerType.slice(1),
    amount: parseFloat(String(r.amount)),
  }));

  const totalFare = rows.reduce((s, r) => s + r.amount, 0);
  const regularCount = rows.filter((r) => r.passengerType === "Regular").length;
  const studentCount = rows.filter((r) => r.passengerType === "Student").length;
  const seniorCount = rows.filter((r) => r.passengerType === "Senior").length;

  if (format === "csv") {
    const xlsxRows = rows.map((r) => ({
      Date: r.date,
      Time: r.time,
      Fleet: r.fleet,
      Driver: r.driver,
      "Driver ID": r.driverId,
      "Passenger Type": r.passengerType,
      "Amount (₱)": r.amount,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(xlsxRows.length ? xlsxRows : [{ Note: "No records in range" }]);
    XLSX.utils.book_append_sheet(wb, ws, "Fare Records");
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="beepjeep-report-${Date.now()}.csv"`);
    res.send(csv);
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "BeepJeep";
  wb.created = new Date();

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const wsSummary = wb.addWorksheet("Summary", {
    properties: { tabColor: { argb: BRAND_GREEN.slice(2) } },
  });
  setCols(wsSummary, [32, 28]);
  addSheetTitle(wsSummary, `BeepJeep Report — Last ${days} Days`, 2);

  const summaryData = [
    ["Report Period", `Last ${days} days`],
    ["Generated At", new Date().toLocaleString("en-PH")],
    ["Admin", req.user!.name],
    ["Total Fleets", fleetIds.length],
    ["Total Fare Records", rows.length],
    ["Total Fare Collected (₱)", `₱${totalFare.toFixed(2)}`],
    ["Average Fare per Trip (₱)", rows.length ? `₱${(totalFare / rows.length).toFixed(2)}` : "₱0.00"],
    ["Regular Passengers", regularCount],
    ["Student Passengers", studentCount],
    ["Senior / PWD Passengers", seniorCount],
  ];

  const headerRowSummary = wsSummary.addRow(["Field", "Value"]);
  applyHeaderRow(headerRowSummary);

  summaryData.forEach(([field, value], i) => {
    const row = wsSummary.addRow([field, value]);
    applyDataRow(row, i % 2 === 1);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: "FF334155" } };
    if (typeof value === "string" && value.startsWith("₱")) {
      row.getCell(2).font = { bold: true, size: 10, color: { argb: "FF16A34A" } };
    }
  });

  wsSummary.addRow([]);
  const noteRow = wsSummary.addRow(["", "This report covers all fleets administered by the above admin."]);
  noteRow.getCell(2).font = { italic: true, color: { argb: "FF94A3B8" }, size: 9 };

  // ── Sheet 2: Fare Records ───────────────────────────────────────────────────
  const wsFare = wb.addWorksheet("Fare Records", {
    properties: { tabColor: { argb: BRAND_ORANGE.slice(2) } },
  });
  setCols(wsFare, [14, 12, 22, 26, 12, 18, 16]);
  addSheetTitle(wsFare, "Fare Records", 7);

  const fareHeader = wsFare.addRow(["Date", "Time", "Fleet", "Driver", "Driver ID", "Passenger Type", "Amount (₱)"]);
  applyHeaderRow(fareHeader);
  fareHeader.getCell(7).alignment = { horizontal: "right", vertical: "middle" };

  if (rows.length === 0) {
    wsFare.addRow(["No records in the selected date range."]);
  } else {
    rows.forEach((r, i) => {
      const row = wsFare.addRow([r.date, r.time, r.fleet, r.driver, r.driverId, r.passengerType, r.amount]);
      applyDataRow(row, i % 2 === 1);
      row.getCell(7).numFmt = '₱#,##0.00';
      row.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
      const ptCell = row.getCell(6);
      if (r.passengerType === "Student") {
        ptCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
        ptCell.font = { size: 10, color: { argb: "FF1D4ED8" } };
      } else if (r.passengerType === "Senior") {
        ptCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
        ptCell.font = { size: 10, color: { argb: "FF92400E" } };
      }
    });
  }

  // Totals row
  wsFare.addRow([]);
  const totalRow = wsFare.addRow(["", "", "", "", "", "TOTAL", totalFare]);
  totalRow.getCell(6).font = { bold: true, color: { argb: "FF1E293B" }, size: 10 };
  totalRow.getCell(7).numFmt = '₱#,##0.00';
  totalRow.getCell(7).font = { bold: true, color: { argb: "FF16A34A" }, size: 11 };
  totalRow.getCell(7).alignment = { horizontal: "right" };
  totalRow.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN_LIGHT } };

  // ── Sheet 3: Fleet Breakdown ────────────────────────────────────────────────
  const wsFleet = wb.addWorksheet("Fleet Breakdown", {
    properties: { tabColor: { argb: "FF7C3AED" } },
  });
  setCols(wsFleet, [28, 14, 18, 14, 14, 14]);
  addSheetTitle(wsFleet, "Fleet Breakdown", 6);

  const fleetHeader = wsFleet.addRow(["Fleet", "Total Trips", "Total Fare (₱)", "Regular", "Student", "Senior"]);
  applyHeaderRow(fleetHeader);

  const fleetBreakdown = adminFleets.map((fleet) => {
    const fr = rows.filter((r) => r.fleet === fleet.name);
    return {
      name: fleet.name,
      trips: fr.length,
      fare: fr.reduce((s, r) => s + r.amount, 0),
      regular: fr.filter((r) => r.passengerType === "Regular").length,
      student: fr.filter((r) => r.passengerType === "Student").length,
      senior: fr.filter((r) => r.passengerType === "Senior").length,
    };
  });

  if (fleetBreakdown.length === 0) {
    wsFleet.addRow(["No fleet data available."]);
  } else {
    fleetBreakdown.forEach((f, i) => {
      const row = wsFleet.addRow([f.name, f.trips, f.fare, f.regular, f.student, f.senior]);
      applyDataRow(row, i % 2 === 1);
      row.getCell(3).numFmt = '₱#,##0.00';
      row.getCell(3).font = { bold: true, size: 10, color: { argb: "FF16A34A" } };
    });
  }

  // ── Sheet 4: Driver Breakdown ───────────────────────────────────────────────
  const wsDriver = wb.addWorksheet("Driver Breakdown", {
    properties: { tabColor: { argb: "FF0369A1" } },
  });
  setCols(wsDriver, [28, 14, 18, 18]);
  addSheetTitle(wsDriver, "Driver Performance Breakdown", 4);

  const driverHeader = wsDriver.addRow(["Driver", "Total Trips", "Total Fare (₱)", "Avg Fare (₱)"]);
  applyHeaderRow(driverHeader);

  const driverMap: Record<string, { trips: number; fare: number }> = {};
  for (const r of rows) {
    if (!driverMap[r.driver]) driverMap[r.driver] = { trips: 0, fare: 0 };
    driverMap[r.driver]!.trips++;
    driverMap[r.driver]!.fare += r.amount;
  }
  const driverBreakdown = Object.entries(driverMap)
    .map(([driver, s]) => ({ driver, ...s, avg: s.trips ? s.fare / s.trips : 0 }))
    .sort((a, b) => b.fare - a.fare);

  if (driverBreakdown.length === 0) {
    wsDriver.addRow(["No driver data available."]);
  } else {
    driverBreakdown.forEach((d, i) => {
      const row = wsDriver.addRow([d.driver, d.trips, d.fare, d.avg]);
      applyDataRow(row, i % 2 === 1);
      row.getCell(3).numFmt = '₱#,##0.00';
      row.getCell(4).numFmt = '₱#,##0.00';
      row.getCell(3).font = { bold: true, size: 10, color: { argb: "FF16A34A" } };
      if (i === 0) {
        row.getCell(1).font = { bold: true, size: 10, color: { argb: BRAND_ORANGE.slice(2) } };
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_ORANGE_LIGHT } };
      }
    });
  }

  // ── Sheet 5: Daily Trend ────────────────────────────────────────────────────
  const wsDaily = wb.addWorksheet("Daily Trend", {
    properties: { tabColor: { argb: "FF0F766E" } },
  });
  setCols(wsDaily, [18, 14, 18]);
  addSheetTitle(wsDaily, "Daily Fare Trend", 3);

  const dailyHeader = wsDaily.addRow(["Date", "Trips", "Fare (₱)"]);
  applyHeaderRow(dailyHeader);

  const dailyMap: Record<string, { trips: number; fare: number }> = {};
  for (const r of rows) {
    if (!dailyMap[r.date]) dailyMap[r.date] = { trips: 0, fare: 0 };
    dailyMap[r.date]!.trips++;
    dailyMap[r.date]!.fare += r.amount;
  }
  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ date, ...s }));

  if (dailyTrend.length === 0) {
    wsDaily.addRow(["No daily data available."]);
  } else {
    dailyTrend.forEach((d, i) => {
      const row = wsDaily.addRow([d.date, d.trips, d.fare]);
      applyDataRow(row, i % 2 === 1);
      row.getCell(3).numFmt = '₱#,##0.00';
      row.getCell(3).font = { bold: true, size: 10, color: { argb: "FF16A34A" } };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
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

  const todayRecords =
    fleetIds.length > 0
      ? await db
          .select()
          .from(fareRecordsTable)
          .where(and(gte(fareRecordsTable.createdAt, today), inArray(fareRecordsTable.fleetId, fleetIds)))
      : [];

  const weekRecords =
    fleetIds.length > 0
      ? await db
          .select()
          .from(fareRecordsTable)
          .where(and(gte(fareRecordsTable.createdAt, sevenDaysAgo), inArray(fareRecordsTable.fleetId, fleetIds)))
      : [];

  const fleetDriverIds =
    fleetIds.length > 0
      ? (
          await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(and(inArray(usersTable.fleetId, fleetIds), eq(usersTable.role, "fleet_driver")))
        ).map((d) => d.id)
      : [];

  const fleetBreakdown = adminFleets.map((fleet) => {
    const fr = todayRecords.filter((r) => r.fleetId === fleet.id);
    return {
      fleetId: fleet.id,
      fleetName: fleet.name,
      fare: fr.reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      passengers: fr.length,
    };
  });

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
