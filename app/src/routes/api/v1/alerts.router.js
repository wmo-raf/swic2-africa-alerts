import Router from "@koa/router";
import AlertsService from "../../../services/alertsService.js";
import { randomPoint } from "@turf/random";
import random from "lodash/random.js";

const router = new Router({
  prefix: "/alerts",
});

class AlertsRouter {
  static async getAlerts(ctx) {
    const alerts = await AlertsService.getAlerts();

    const { detail } = ctx.request.query;

    let alertsDetail = [];

    if (detail) {
      alertsDetail = await AlertsService.getAlertsDetail(alerts);
    }

    const alertFeaturesWithDetail = alerts.features.map((feature) => {
      if (feature.properties.link) {
        const alertDetail = alertsDetail.find(
          (d) => d.capLink === feature.properties.link
        );
        if (alertDetail) {
          feature.properties.alertDetail = alertDetail.alert;
        }
      }

      return { ...feature };
    });

    alerts.features = alertFeaturesWithDetail;

    ctx.body = alerts;
  }
  static async getAlertDetail(ctx) {
    const { capUrl, type } = ctx.request.query;

    const alertDetail = await AlertsService.getAlertDetail(capUrl, type);

    ctx.body = alertDetail;
  }
  static async getRandomTestAlerts(ctx) {
    const featureCollection = randomPoint(random(1, 4), {
      bbox: [
        -25.3605509351584004, -34.8219979618462006, 63.4957562687202994,
        37.3404070787983002,
      ],
    });

    const features = featureCollection.features.map((feature) => {
      const props = {
        severity: random(1, 4),
        urgency: random(1, 4),
        certainty: random(1, 4),
        radius: random(50, 89),
      };

      return { ...feature, properties: props };
    });

    ctx.body = { ...featureCollection, features };
  }
}

router.get("/", AlertsRouter.getAlerts);
router.get("/detail", AlertsRouter.getAlertDetail);
router.get("/test", AlertsRouter.getRandomTestAlerts);

export default router;
