require("dotenv").config();
const winston = require("winston");
const winstonDaily = require("winston-daily-rotate-file");
const { combine, timestamp, printf } = winston.format;
const LEVEL = Symbol.for("level");

// Define log format
const logFormat = printf((msg) => {
  return `${msg.timestamp} ${msg.level}: ${msg.message}`;
});

// Custom format to log only the messages the match 'level'
const filterOnly = (level) =>
  winston.format((info) => {
    if (info[LEVEL] === level) return info;
  })();

/*
 * Log Level
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */
const logger = winston.createLogger({
  format: combine(
    timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    logFormat
  ),
  transports: [
    // Setup a file to store 'http' level logs
    new winstonDaily({
      level: "http",
      datePattern: "YYYY-MM-DD",
      dirname: process.env.LOG_DIR + "/http",
      filename: `%DATE%`,
      extension: ".http.log",
      maxFiles: "7d", // Save a log file for 7 days
      zippedArchive: true,
    }),
    // Setup a file to store 'error' level logs
    new winstonDaily({
      level: "error",
      datePattern: "YYYY-MM-DD",
      dirname: process.env.LOG_DIR + "/error", // Save the error.log file under /logs/error
      filename: `%DATE%`,
      extension: ".error.log",
      maxFiles: "7d",
      zippedArchive: true,
    }),
    // Setup just to log
    new winston.transports.Console({
      level: "debug",
      format: filterOnly("debug"),
    }),
    new winston.transports.Console({
      level: "http",
      format: filterOnly("http"),
    }),
  ],
});

// Stream to take over http logs (Morgan) to Winston
logger.stream = { write: (msg) => logger.http(msg.trim()) };

// If not in a production environment (dev, etc.)
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Color and print
        winston.format.simple() // Output as `${info.level}: ${info.message} JSON.stringify({ ...rest })` format
      ),
    })
  );
}

// Function that logs failed requests, capturing the request path, response status, and error details.
const logError = (req, res, err) => {
  logger.error(
    `Request failed: { path: ${req.path}, status: ${res.statusCode}, error: ${err.name}, ${err.message} }`
  );
  return res.send(err.message);
};
// Function that logs successful requests with the request path and response status.
function logSuccess(req, res) {
   res.status(200);
   logger.info(
     `Request successful: { path: ${req.path}, status: ${res.statusCode} }`
   );
 }

module.exports = { logger, logError };
