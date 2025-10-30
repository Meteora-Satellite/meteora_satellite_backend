import { Router } from 'express';
import mongoose from 'mongoose';

const r = Router();
r.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    data: {
      uptime: process.uptime(),
      mongo: mongoose.connection.readyState === 1 ? 'up' : 'down'
    }
  });
});
export default r;
