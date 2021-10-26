import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config/config';
import genericErrorHandler from './middlewares/genericErrorHandler';
import notFoundHandler from './middlewares/notFoundHandler';
import router from './routes/routes';
import generateStaticRoutes from './routes/static';

const { name, version } = config;
const app: express.Application = express();

app.locals.name = name;
app.locals.version = version;

app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', router);
app.set('port', 4000);


generateStaticRoutes(router)
app.use(genericErrorHandler);
app.use(notFoundHandler);


export default app;
