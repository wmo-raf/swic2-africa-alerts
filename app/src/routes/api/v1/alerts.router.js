import Router from "@koa/router";
import AlertsService from "../../../services/alertsService.js";

const router = new Router({
  prefix: "/alerts",
});

class AlertsRouter {
  static async getAlerts(ctx) {
    const alerts = await AlertsService.getAlerts();
    ctx.body = alerts;
  }
}

router.get("/", AlertsRouter.getAlerts);

export default router;
