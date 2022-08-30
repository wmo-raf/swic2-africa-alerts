import config from "config";
import bunyan from "bunyan";

const streams = [
  {
    stream: process.stdout,
    level: config.get("logger.level") || "debug",
  },
  {
    stream: process.stderr,
    level: "warn",
  },
];

if (config.get("logger.toFile")) {
  streams.push({
    level: config.get("logger.level") || "debug",
    path: config.get("logger.dirLogFile"),
  });
}

const logger = bunyan.createLogger({
  name: config.get("logger.name"),
  src: true,
  streams,
});

export default logger;
