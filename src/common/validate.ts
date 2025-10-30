import type { RequestHandler } from 'express';
import { ZodSchema } from 'zod';

type Part = 'body' | 'query' | 'params';

export function validate(schemas: Partial<Record<Part, ZodSchema>>): RequestHandler {
  return (req, res, next) => {
    try {
      if (schemas.body)   req.body   = schemas.body.parse(req.body);
      if (schemas.query)  req.query  = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err: any) {
      return res.status(400).json({
        ok: false,
        error: { message: 'Validation failed', details: err.errors ?? String(err) }
      });
    }
  };
}
