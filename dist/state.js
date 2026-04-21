import { EventEmitter } from 'node:events';
class ChatEventBus {
    emitter = new EventEmitter();
    constructor() {
        // Default setting is 10; we expect a handful of listeners (logger, audit, dashboard SSE).
        this.emitter.setMaxListeners(50);
    }
    on(event, handler) {
        this.emitter.on(event, handler);
    }
    off(event, handler) {
        this.emitter.off(event, handler);
    }
    emit(event, payload) {
        this.emitter.emit(event, payload);
    }
}
export const chatEvents = new ChatEventBus();
//# sourceMappingURL=state.js.map