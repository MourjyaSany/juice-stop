import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ulid } from 'ulid';
import { AppConfigModule } from '../config/config.module.js';
import { AppConfigService } from '../config/config.service.js';

/**
 * Paths scrubbed from every log line.
 *
 * A log leak is a data breach. This list is deliberately broad — over-redacting costs a debugging
 * session, under-redacting costs a DPDP notification. `redaction.spec.ts` proves each path works;
 * do not add a field here without adding a test alongside it.
 */
const REDACT_PATHS = [
  // credentials & tokens
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.refreshTokenHash',
  '*.otp',
  '*.code',
  '*.codeHash',
  '*.secret',
  '*.totpSecret',
  '*.totpSecretEncrypted',
  '*.apiKey',
  // customer PII
  '*.phone',
  '*.phoneE164',
  '*.email',
  '*.fullName',
  '*.address',
  '*.addressSnapshot',
  '*.flatOrRoom',
  '*.landmark',
  '*.contactPhone',
  '*.contactPhoneE164',
  '*.lat',
  '*.lng',
  // payment instruments — we never hold these, but never log them either
  '*.card',
  '*.cardNumber',
  '*.cvv',
  '*.upiId',
  // nested one level, which covers most request/response bodies
  'req.body.password',
  'req.body.otp',
  'req.body.code',
  'req.body.phone',
  'req.body.email',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.observability.logLevel,

          // Pretty output locally; structured JSON everywhere else so Loki can index it.
          // Spread rather than assigning `undefined` — under exactOptionalPropertyTypes, an
          // explicit undefined is not the same as an absent key.
          ...(config.isProduction
            ? {}
            : {
                transport: {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname,req,res',
                    messageFormat: '{context} {msg}',
                  },
                },
              }),

          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },

          // Correlation id: honour an inbound one (so a trace survives across services),
          // otherwise mint a sortable ULID.
          genReqId: (req, res) => {
            const existing = req.headers['x-request-id'];
            const id = typeof existing === 'string' && existing.length > 0 ? existing : ulid();
            res.setHeader('x-request-id', id);
            return id;
          },

          customProps: () => ({ role: config.role }),

          // Health checks would otherwise dominate the logs at one line per second.
          autoLogging: {
            ignore: (req) => req.url === '/health/live' || req.url === '/health/ready',
          },

          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },

          serializers: {
            req: (req) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              // Never serialise headers or body wholesale — redaction is path-based and a novel
              // key would slip through.
            }),
            res: (res) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
