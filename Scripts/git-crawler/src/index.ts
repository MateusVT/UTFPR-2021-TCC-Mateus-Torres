import app from './app';
import config from './config/config';
import nodeErrorHandler from './middlewares/nodeErrorHandler';

app
  .listen(config.port, () => {
    console.info(`Server started at http://${config.host}:${config.port}`);
  })
  .on('error', nodeErrorHandler);
