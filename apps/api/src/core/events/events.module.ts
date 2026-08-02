import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service.js';

/**
 * Global so any module can publish without threading the service through imports. Realtime is a
 * cross-cutting concern like logging, not a feature one module owns.
 */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class EventsModule {}
