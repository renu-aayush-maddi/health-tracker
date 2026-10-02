// Logs method, path (without the query string, which may contain health search terms),
// status and duration. Never logs bodies, cookies or headers.
export function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.originalUrl.split('?')[0];
    console.log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
