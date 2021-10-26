import { Router } from 'express';
import * as server from '../controllers/server';

const router: Router = Router();

router.get('/', server.status);
router.get('/routes', server.routes);

export default router;
