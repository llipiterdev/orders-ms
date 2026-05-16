import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'orders-ms',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  metrics() {
    return (
      '# HELP orders_ms_up simple process availability metric\n' +
      '# TYPE orders_ms_up gauge\n' +
      'orders_ms_up 1\n'
    );
  }
}
