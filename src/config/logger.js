'use strict';

const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('./index');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${ts} [${level}] ${stack || message}`;
  })
);

const fileFormat = combine(timestamp(), errors({ stack: true }), json());

const transports = [
  new winston.transports.Console({ format: consoleFormat }),
];

// Persist rotating logs to disk outside development for observability.
if (!config.isTest) {
  transports.push(
    new winston.transports.DailyRotateFile({
      dirname: path.resolve(process.cwd(), 'logs'),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
    }),
    new winston.transports.DailyRotateFile({
      dirname: path.resolve(process.cwd(), 'logs'),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    })
  );
}

const logger = winston.createLogger({
  level: config.logLevel,
  transports,
  exitOnError: false,
});

// Stream adapter so morgan writes HTTP logs through winston.
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
