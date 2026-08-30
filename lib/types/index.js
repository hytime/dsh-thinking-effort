import { mark } from './host/marker.js';
import { installSettingsWatcher } from './host/settings.js';
import { handleAgentRequest } from './host/subagent.js';
export const name = '@hytime/dsh-thinking-effort';
export const inject = ['settings', 'timer'];
export function apply(ctx) {
    mark('apply');
    installSettingsWatcher(ctx);
    ctx.on('agent/request', (...args) => {
        const payload = args[0];
        const next = args[1];
        return handleAgentRequest(ctx, payload, next);
    }, { global: true });
}
//# sourceMappingURL=index.js.map