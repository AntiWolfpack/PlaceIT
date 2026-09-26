import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketplaceRouter from "./marketplace";
import ordersRouter from "./orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketplaceRouter);
router.use(ordersRouter);

export default router;
