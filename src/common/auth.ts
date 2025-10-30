import jwt from 'jsonwebtoken';
import { env } from '@config';
import { StringValue } from "ms";

export function signAccess(payload: object) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as StringValue });
}
export function signRefresh(payload: object) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL as StringValue });
}
export function verifyAccess<T = any>(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as T;
}
export function verifyRefresh<T = any>(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as T;
}
