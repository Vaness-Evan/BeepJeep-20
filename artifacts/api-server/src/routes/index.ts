import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import fleetsRouter from "./fleets";
import faresRouter from "./fares";
import reportsRouter from "./reports";
import ratingsRouter from "./ratings";
import fareSettingsRouter from "./fare_settings";
import driverStatsRouter from "./driver_stats";
import fleetRoutesRouter from "./fleet_routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(fleetsRouter);
router.use(faresRouter);
router.use(reportsRouter);
router.use(ratingsRouter);
router.use(fareSettingsRouter);
router.use(driverStatsRouter);
router.use(fleetRoutesRouter);

export default router;
