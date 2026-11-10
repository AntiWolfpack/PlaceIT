import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketplaceRouter from "./marketplace";
import ordersRouter from "./orders";
import vendorOrdersRouter from "./vendor-orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketplaceRouter);
router.use(ordersRouter);
router.use(vendorOrdersRouter);

export default router;
