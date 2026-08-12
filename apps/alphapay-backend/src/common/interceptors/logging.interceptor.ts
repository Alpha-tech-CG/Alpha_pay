import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const { method, url } = req;
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const status = ctx.switchToHttp().getResponse().statusCode;
        this.logger.log(`${method} ${url} ${status} — ${Date.now() - start}ms`);
      }),
    );
  }
}
