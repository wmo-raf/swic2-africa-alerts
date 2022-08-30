import fs from "fs";
import mount from "koa-mount";
import path from "path";
import { fileURLToPath } from "url";

import logger from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routersPath = `${__dirname}/routes`;

/**
 * Load routers
 */
export default (() => {
  const loadAPI = async (app, path, pathApi) => {
    const routesFiles = fs.readdirSync(path);
    let existIndexRouter = false;

    routesFiles.forEach(async (file) => {
      const newPath = path ? `${path}/${file}` : file;
      const stat = fs.statSync(newPath);

      if (!stat.isDirectory()) {
        if (file.lastIndexOf(".router.js") !== -1) {
          if (file === "index.router.js") {
            existIndexRouter = true;
          } else {
            logger.debug("Loading route %s, in path %s", newPath, pathApi);
            const moduleFile = await import(newPath);
            if (pathApi) {
              app.use(mount(pathApi, moduleFile.default.routes()));
            } else {
              app.use(moduleFile.moduleFile.default.routes()());
            }
          }
        }
      } else {
        // is folder
        const newPathAPI = pathApi ? `${pathApi}/${file}` : `/${file}`;
        loadAPI(app, newPath, newPathAPI);
      }
    });

    if (existIndexRouter) {
      // load indexRouter when finish other Router
      const newPath = path ? `${path}/index.router.js` : "index.router.js";
      logger.debug("Loading route %s, in path %s", newPath, pathApi);
      const moduleFile = await import(newPath);

      if (pathApi) {
        app.use(mount(pathApi, moduleFile.default.middleware()));
      } else {
        app.use(moduleFile.default.middleware());
      }
    }
  };

  const loadRoutes = (app) => {
    logger.debug("Loading routes...");
    loadAPI(app, routersPath);
    logger.debug("Loaded routes correctly!");
  };

  return {
    loadRoutes,
  };
})();
