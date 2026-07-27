import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { AppError, ErrorCode, type FieldError } from './app-error.js';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance: string;
  requestId: string;
  errors?: FieldError[];
  meta?: Record<string, unknown>;
}

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

/**
 * Translates every thrown value into RFC 9457 `application/problem+json`.
 *
 * One shape, everywhere. Clients never have to guess at an error's structure, and — critically —
 * internal details never reach the wire. A 500 gives the client a `requestId` and nothing else;
 * the stack trace goes to the logs where it belongs.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    // pino-http assigns the correlation id to `req.id` (see LoggingModule.genReqId) and echoes it
    // on the response header. Read it from the request object — the inbound *request* header is
    // only present when a caller supplied one, which would leave most errors unattributable.
    const requestId =
      request.id ??
      (response.getHeader('x-request-id') as string | undefined) ??
      (request.headers['x-request-id'] as string | undefined) ??
      'unknown';

    const problem = this.toProblem(exception, request.url, requestId);

    // 5xx is our fault and gets a full stack. 4xx is the client's and stays terse — a flood of
    // stack traces from validation errors buries the one that actually matters.
    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId, problem }, problem.detail);
    } else {
      this.logger.warn({ requestId, code: problem.code, status: problem.status }, problem.detail);
    }

    if (problem.status === 429 && typeof problem.meta?.['retryAfterSeconds'] === 'number') {
      response.setHeader('Retry-After', String(problem.meta['retryAfterSeconds']));
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(exception: unknown, instance: string, requestId: string): ProblemDetails {
    const base = { instance, requestId };

    if (exception instanceof AppError) {
      return {
        ...base,
        type: `https://juicestop.in/errors/${slug(exception.code)}`,
        title: TITLES[exception.status] ?? 'Error',
        status: exception.status,
        code: exception.code,
        detail: exception.message,
        ...(exception.fieldErrors ? { errors: exception.fieldErrors } : {}),
        ...(exception.meta ? { meta: exception.meta } : {}),
      };
    }

    if (exception instanceof ZodError) {
      return {
        ...base,
        type: 'https://juicestop.in/errors/validation-failed',
        title: TITLES[400]!,
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        detail: 'Some of the submitted values are invalid.',
        errors: exception.issues.map((i) => ({
          field: i.path.join('.'),
          code: i.code.toUpperCase(),
          message: i.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const detail =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        ...base,
        type: 'https://juicestop.in/errors/http',
        title: TITLES[status] ?? 'Error',
        status,
        code: status === 404 ? ErrorCode.RESOURCE_NOT_FOUND : ErrorCode.INTERNAL_ERROR,
        detail: Array.isArray(detail) ? detail.join('; ') : detail,
      };
    }

    // Unknown throwable. Never leak the message — it may contain a connection string or SQL.
    return {
      ...base,
      type: 'https://juicestop.in/errors/internal',
      title: TITLES[500]!,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      detail: `Something went wrong on our end. Quote reference ${requestId} to support.`,
    };
  }
}

const slug = (code: string): string => code.toLowerCase().replace(/_/g, '-');
