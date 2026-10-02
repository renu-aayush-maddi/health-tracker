import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function limiter({ windowMs, limit, key = (req) => ipKeyGenerator(req.ip) }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: key,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Automated tests sign up many users from one IP. Limits have their own backend test,
    // and DISABLE_RATE_LIMITS is rejected in production (see config/env.js).
    skip: () => (config.isTest && !process.env.ENABLE_RATE_LIMITS) || config.rateLimitsDisabled,
    handler: (req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait a few minutes and try again.',
        },
      }),
  });
}

const ipAndEmail = (req) =>
  `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '')
    .toLowerCase()
    .slice(0, 254)}`;

export const loginLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10, key: ipAndEmail });
export const registerLimiter = limiter({ windowMs: HOUR, limit: 5 });
export const forgotPasswordIpLimiter = limiter({ windowMs: HOUR, limit: 5 });
export const forgotPasswordEmailLimiter = limiter({
  windowMs: HOUR,
  limit: 3,
  key: (req) =>
    `email|${String(req.body?.email ?? '')
      .toLowerCase()
      .slice(0, 254)}`,
});
export const passwordChangeLimiter = limiter({ windowMs: HOUR, limit: 10 });
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  key: (req) => req.auth?.userId ?? ipKeyGenerator(req.ip),
});

export const uploadLimiter = limiter({
  windowMs: HOUR,
  limit: 60,
  key: (req) => `upload|${req.auth?.userId ?? ipKeyGenerator(req.ip)}`,
});

export const exportLimiter = limiter({
  windowMs: HOUR,
  limit: 10,
  key: (req) => `export|${req.auth?.userId ?? ipKeyGenerator(req.ip)}`,
});
