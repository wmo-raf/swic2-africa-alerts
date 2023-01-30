import config from "config";
import bunyan from "bunyan";
import bformat from "bunyan-format";

const formatOut = bformat({ outputMode: "long" });
const formatErr = bformat({ outputMode: "long" }, process.stderr);

const streams = [
  {
    stream: formatOut,
    level: config.get("logger.level") || "debug",
  },
  {
    stream: formatErr,
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
