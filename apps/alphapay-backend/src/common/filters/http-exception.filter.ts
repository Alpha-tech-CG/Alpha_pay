import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/** Uniform error envelope; never leaks stack traces or internals to clients. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        message = (body as { message?: string | string[] }).message ?? exception.message;
        error = (body as { error?: string }).error ?? exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(`${req.method} ${req.url} — ${exception.message}`, exception.stack);
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
