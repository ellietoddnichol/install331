import { Router } from 'express';
import { validateDiv10SheetsBackendHealth } from '../../services/sheets/div10SheetsValidationService.ts';

export const adminRouter = Router();

adminRouter.get('/div10-sheets/health', async (_req, res, next) => {
  try {
    const payload = await validateDiv10SheetsBackendHealth();
    res.status(200).json(payload);
  } catch (err: unknown) {
    next(err);
  }
});
