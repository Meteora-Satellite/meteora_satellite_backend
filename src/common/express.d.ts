import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user: {
      uid: string;
      externalAddress: string;
      custodialAddress: string;
      roles: string[];
      iat?: number;
      exp?: number;
      [k: string]: any;
    };
  }
}
