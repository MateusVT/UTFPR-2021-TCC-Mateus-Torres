import { Router } from 'express';
import * as executeController from '../controllers/execute/execute';

function generateStaticRoutes(router: Router) {
    
    //                   ----- GETs -----
    router.get('/execute', executeController.execute);
    router.get('/treatment', executeController.treatment);
    router.get('/limit', executeController.limit);

}

export default generateStaticRoutes;
