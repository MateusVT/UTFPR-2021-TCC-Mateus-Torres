import { Request, Response } from 'express';
import * as HttpStatus from 'http-status-codes';
import router from '../routes/routes';

export function status(req: Request, res: Response): void {
  res.status(HttpStatus.OK).json({
    name: req.app.locals.name,
    version: req.app.locals.version,
    author: "Mateus V. Torres",
    contact: "mtsvtorres@gmail.com",
  });
}

export function routes(_req: Request, res: Response): void {
  const routes = router.stack.map(route => {
    if (route.route && route.route.path) {
      return { path: route.route.path, methods: route.route.methods }
    }
  })

  res.status(HttpStatus.OK).json({ routes: routes });
}