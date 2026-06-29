import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Endpoint Prometheus scrape.
 * Protégé par Bearer token (METRICS_TOKEN) si défini, open en local si absent.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: Request): Promise<string> {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const auth = req.headers['authorization'] ?? '';
      if (auth !== `Bearer ${token}`) throw new UnauthorizedException();
    }
    // Le Content-Type Prometheus (text/plain; version=0.0.4) est fixé via @Header
    // mais doit matcher le contentType du registry — on le surcharge manuellement.
    const res = (req as any).res;
    res?.setHeader('Content-Type', this.metrics.contentType());
    return this.metrics.getMetrics();
  }
}
