import * as dotenv from 'dotenv';

import app from '../../package.json';
import errors from './errors.json';

dotenv.config();

export default {
  errors,
  name: app.name,
  version: app.version,
  host: '127.0.0.1',
  environment: 'development',
  appUrl: 'http://localhost:3000',
  port: '3000',
  pagination: {
    page: 1,
    maxRows: 20
  },
  logging: {
    dir: process.env.LOGGING_DIR || 'logs',
    level: process.env.LOGGING_LEVEL || 'debug',
    maxSize: process.env.LOGGING_MAX_SIZE || '20m',
    maxFiles: process.env.LOGGING_MAX_FILES || '7d',
    datePattern: process.env.LOGGING_DATE_PATTERN || 'YYYY-MM-DD'
  }
};


