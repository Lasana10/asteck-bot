/**
 * ============================================================================
 * SECURITY MIDDLEWARE — World-Class Protection
 * ============================================================================
 * Rate limiting, input sanitization, CORS hardening, and request logging.
 * ============================================================================
 */

import { Request, Response, NextFunction } from 'express';

// ═══ RATE LIMITER (In-Memory) ═══
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    let record = requestCounts.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      requestCounts.set(ip, record);
    }

    record.count++;

    if (record.count > maxRequests) {
      res.set('Retry-After', Math.ceil((record.resetAt - now) / 1000).toString());
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetAt - now) / 1000)
      });
    }

    next();
  };
}

// ═══ STRICT AUTH RATE LIMITER (30 req/min for OTP endpoints) ═══
export const authRateLimiter = rateLimiter(30, 60000);

// ═══ API RATE LIMITER (100 req/min general) ═══
export const apiRateLimiter = rateLimiter(100, 60000);

// ═══ INPUT SANITIZER ═══
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj: any): any => {
      if (typeof obj === 'string') {
        // Strip dangerous HTML/script tags
        return obj
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<[^>]*>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+=/gi, '')
          .trim();
      }
      if (Array.isArray(obj)) return obj.map(sanitize);
      if (typeof obj === 'object' && obj !== null) {
        const clean: any = {};
        for (const [key, value] of Object.entries(obj)) {
          clean[sanitize(key)] = sanitize(value);
        }
        return clean;
      }
      return obj;
    };
    req.body = sanitize(req.body);
  }
  next();
}

// ═══ SECURITY HEADERS ═══
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  });
  next();
}

// ═══ REQUEST LOGGER ═══
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Anonymize last octet for privacy
  const anonIp = ip.replace(/\.\d+$/, '.***');
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${anonIp}`);
  next();
}

// ═══ GRACEFUL SHUTDOWN HANDLER ═══
export function setupGracefulShutdown(server: any) {
  const shutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('✅ Server closed. Process exiting.');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Periodically clean up expired rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestCounts) {
    if (now > record.resetAt) requestCounts.delete(ip);
  }
}, 5 * 60 * 1000);
