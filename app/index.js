import dotEnv from "dotenv";

import logger from "./src/logger.js";
import app from "./src/app.js";

// load .env file
dotEnv.config();

app().then(
  () => {
    logger.info("Server running");
  },
  (err) => {
    logger.error("Error running server", err);
  }
);
