import { Request, Response } from 'express';
import './users.schema';

export default class UserController {
  static async custodialAddress(req: Request, res: Response) {
    return res.json({ ok: true, data: { address: req.user.custodialAddress } });
  }
}
