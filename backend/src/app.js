const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const env = require('./config/environment');
const sanitize = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
// "simple" query parser: values are flat strings only, so `?price[$gt]=1` cannot become an operator object.
app.set('query parser', 'simple');
if (env.isProd) app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server (no Origin header) and the configured origins only.
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);

// Liveness + database readiness. Read-only ping; the response never includes connection details or errors.
app.get('/health', require('./utils/health'));

const v1 = express.Router();
v1.use(apiLimiter);
v1.use('/auth', require('./routes/auth.routes'));
v1.use('/users', require('./routes/user.routes'));
v1.use('/categories', require('./routes/category.routes'));
v1.use('/products', require('./routes/product.routes'));
v1.use('/orders', require('./routes/order.routes'));
v1.use('/admin', require('./routes/order.routes').adminRouter);
app.use('/api/v1', v1);

// Swagger UI at /api-docs and OpenAPI JSON at /api-docs.json (SWAGGER_ENABLED; see config/swagger.js)
require('./config/swagger').mountSwagger(app);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
