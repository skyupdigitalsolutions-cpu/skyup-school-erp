'use strict';

const path = require('path');
const dotenv = require('dotenv');
const Joi = require('joi');

// Load .env before anything else reads process.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Environment schema. The application refuses to boot if required
 * variables are missing or malformed — fail fast, never in production.
 */
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(5000),
  API_PREFIX: Joi.string().default('/api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),

  MONGO_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
  CONTROL_PLANE_DB: Joi.string().default('school_erp_control'),
  TENANT_DB_PREFIX: Joi.string().default('school_erp_'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  COOKIE_DOMAIN: Joi.string().default('localhost'),
  COOKIE_SECURE: Joi.boolean().default(false),

  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: Joi.number().default(300),
  AUTH_RATE_LIMIT_MAX: Joi.number().default(20),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow('').default(''),
  CLOUDINARY_API_KEY: Joi.string().allow('').default(''),
  CLOUDINARY_API_SECRET: Joi.string().allow('').default(''),

  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().allow('').default('School ERP <no-reply@example.com>'),

  WHATSAPP_API_URL: Joi.string().allow('').default(''),
  WHATSAPP_API_TOKEN: Joi.string().allow('').default(''),
  // Both genuinely required by MSG91's WhatsApp send contract but absent from
  // the pre-existing env slots — added here rather than assumed. Empty by
  // default, same as the other two: nothing sends until all four are set.
  WHATSAPP_SENDER_NUMBER: Joi.string().allow('').default(''),
  WHATSAPP_TEMPLATE_NAME: Joi.string().allow('').default(''),
  SMS_API_URL: Joi.string().allow('').default(''),
  SMS_API_KEY: Joi.string().allow('').default(''),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'debug')
    .default('info'),
}).unknown(true);

const { value: env, error } = envSchema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment configuration:\n' +
      error.details.map((d) => `  - ${d.message}`).join('\n')
  );
  process.exit(1);
}

/**
 * Frozen, typed configuration object consumed everywhere in the app.
 * No file outside this module should read process.env directly.
 */
const config = Object.freeze({
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiPrefix: env.API_PREFIX,
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),

  db: {
    uri: env.MONGO_URI,
    controlPlaneDb: env.CONTROL_PLANE_DB,
    tenantDbPrefix: env.TENANT_DB_PREFIX,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  cookie: {
    domain: env.COOKIE_DOMAIN,
    secure: env.COOKIE_SECURE,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    authMax: env.AUTH_RATE_LIMIT_MAX,
  },

  cloudinary: {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  },

  mail: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM,
  },

  notifications: {
    whatsappUrl: env.WHATSAPP_API_URL,
    whatsappToken: env.WHATSAPP_API_TOKEN,
    whatsappSenderNumber: env.WHATSAPP_SENDER_NUMBER,
    whatsappTemplateName: env.WHATSAPP_TEMPLATE_NAME,
    smsUrl: env.SMS_API_URL,
    smsKey: env.SMS_API_KEY,
  },

  logLevel: env.LOG_LEVEL,
});

module.exports = config;
