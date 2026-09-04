// Lightweight structured logger.
// Dev: human-readable console lines. Prod: single-line JSON (easy to ingest by any log system).
const isProd = process.env.NODE_ENV === 'production';

const format = (level, message, meta) => {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta } : {}),
  };
  return isProd ? JSON.stringify(entry) : `[${entry.time}] ${level.toUpperCase()}: ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
};

const logger = {
  info: (message, meta) => console.log(format('info', message, meta)),
  warn: (message, meta) => console.warn(format('warn', message, meta)),
  error: (message, meta) => console.error(format('error', message, meta)),
};

export default logger;
