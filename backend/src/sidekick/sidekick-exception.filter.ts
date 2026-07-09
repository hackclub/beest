import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Normalizes every error thrown inside the Sidekick controller to the
 * protocol's `{ error, message }` body. Reused Beest services throw plain
 * Nest exceptions (`BadRequestException('msg')` → `{statusCode, message,
 * error}` by default), which Sidekick can't parse — this filter rewrites
 * them, mapping the HTTP status to a protocol error code. Exceptions thrown
 * with an `{ error, message }` object body pass through unchanged.
 */
@Catch()
export class SidekickExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SidekickExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Nest's default body ({statusCode, message, error: 'Not Found'}) also
      // has string error/message — the statusCode field is what tells a
      // deliberately protocol-shaped body apart from the default one.
      if (
        typeof body === 'object' &&
        body !== null &&
        !('statusCode' in body) &&
        typeof (body as Record<string, unknown>).error === 'string' &&
        typeof (body as Record<string, unknown>).message === 'string'
      ) {
        res.status(status).json(body);
        return;
      }

      const rawMessage =
        typeof body === 'string'
          ? body
          : ((body as Record<string, unknown>)?.message ?? exception.message);
      const message = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : String(rawMessage);

      res.status(status).json({ error: codeForStatus(status), message });
      return;
    }

    this.logger.error(
      `Unhandled error in Sidekick endpoint: ${
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)
      }`,
    );
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    });
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 503:
      return 'UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}
