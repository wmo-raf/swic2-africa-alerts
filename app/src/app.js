import config from "config";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import KoaLogger from "koa-logger";
import cors from "@koa/cors";
import koaSimpleHealthcheck from "koa-simple-healthcheck";

import loader from "./loader.js";
import logger from "./logger.js";
import ErrorSerializer from "./serializers/errorSerializer.js";

async function init() {
  // instance of koa
  const app = new Koa();

  app.use(cors());

  app.use(KoaLogger());

  app.use(koaSimpleHealthcheck());

  app.use(bodyParser({}));

  // catch errors and send in jsonapi standard. Always return vnd.api+json
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (inErr) {
      let error = inErr;
      try {
        error = JSON.parse(inErr);
      } catch (e) {
        logger.debug("Could not parse error message - is it JSON?: ", inErr);
        error = inErr;
      }
      ctx.status = error.status || ctx.status || 500;
      if (ctx.status >= 500) {
        logger.error(error);
      } else {
        logger.info(error);
      }

      ctx.body = ErrorSerializer.serializeError(ctx.status, error.message);
      if (process.env.NODE_ENV === "prod" && ctx.status === 500) {
        ctx.body = "Unexpected error";
      }
      ctx.response.type = "application/vnd.api+json";
    }
  });

  // load routes
  loader.loadRoutes(app);

  const port = process.env.PORT || config.get("service.port");

  app.listen(port);

  logger.info(`Server started in port:${port}`);
}

export default init;
