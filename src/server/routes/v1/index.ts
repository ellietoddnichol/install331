import { Router } from 'express';
import { projectsRouter } from './projectsRoutes.ts';
import { roomsRouter } from './roomsRoutes.ts';
import { takeoffRouter } from './takeoffRoutes.ts';
import { settingsRouter } from './settingsRoutes.ts';
import { modifiersRouter } from './modifiersRoutes.ts';
import { bundlesRouter } from './bundlesRoutes.ts';
import { intakeRouter } from './intakeRoutes.ts';

export const v1Router = Router();

v1Router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: 'v1' });
});

v1Router.use('/projects', projectsRouter);
v1Router.use('/rooms', roomsRouter);
v1Router.use('/takeoff', takeoffRouter);
v1Router.use('/settings', settingsRouter);
v1Router.use('/modifiers', modifiersRouter);
v1Router.use('/bundles', bundlesRouter);
v1Router.use('/intake', intakeRouter);
