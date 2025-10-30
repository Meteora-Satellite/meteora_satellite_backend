import type { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '@common/auth';

/** Extracts a bearer token from Authorization header. */
function getBearer(req: Request): string | null {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

/**
 * AuthGuard
 * - If `required` (default true): 401 when missing/invalid token.
 * - If `roles` are provided: 403 when user lacks any of the roles.
 */
export function authGuard(opts?: { required?: boolean; roles?: string[] }) {
  const required = opts?.required ?? true;
  const needRoles = opts?.roles ?? [];

  return (req: Request, res: Response, next: NextFunction) => {
    const token = getBearer(req);

    if (!token) {
      if (required) return res.status(401).json({ ok: false, error: { message: 'Missing bearer token' } });
      return next(); // optional auth
    }

    try {
      const payload = verifyAccess<any>(token); // { uid, roles, address, ... }
      // Attach to request for downstream handlers
      req.user = {
        uid: payload.uid,
        externalAddress: payload.externalAddress,
        custodialAddress: payload.custodialAddress,
        roles: Array.isArray(payload.roles) ? payload.roles : []
      };

      // Role gate (require ANY of the needRoles)
      if (needRoles.length) {
        const has = req.user.roles.some(r => needRoles.includes(r));
        if (!has) return res.status(403).json({ ok: false, error: { message: 'Forbidden' } });
      }

      return next();
    } catch {
      if (required) return res.status(401).json({ ok: false, error: { message: 'Invalid or expired token' } });
      return next();
    }
  };
}

/** Convenience: require any of the given roles. */
export const requireRoles = (...roles: string[]) => authGuard({ required: true, roles });

/** Convenience: optional auth (attaches req.user if present, otherwise continues). */
export const optionalAuth = () => authGuard({ required: false });
