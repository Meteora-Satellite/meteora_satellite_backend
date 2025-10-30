import { Request, Response } from 'express';
import SolanaMethods from '../../solana/methods';
import './wallets.schema'
import { WalletService } from "@modules/wallets/wallets.service";
import { privateKeyFromWallet } from "../../solana/utils";
import bs58 from "bs58";

export default class WalletsController {
  static async getWalletBalances(req: Request, res: Response) {
    try {
      const balances = await SolanaMethods.getWalletBalances(req.user.custodialAddress);

      return res.json({ ok: true, data: balances });
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      return res.status(500).json({ ok: false, error: { message: 'Failed to fetch wallet balance', status: 500 } });
    }
  };

  static async getWalletPrivateKey(req: Request, res: Response) {
    try {
      const wallet = await WalletService.findCustodialByUser(req.user.uid);
      if (!wallet) {
        return res.status(400).json({ ok: false, error: { message: 'User wallet is not found', status: 400 } })
      }

      const privateKey = privateKeyFromWallet(wallet);
      const base58 = bs58.encode(Buffer.from(privateKey));

      return res.json({ ok: true, data: base58 });
    } catch (error) {
      console.error('Error fetching wallet private key:', error);
      return res.status(500).json({ ok: false, error: { message: 'Failed to fetch wallet private key', status: 500 } });
    }
  };
}
