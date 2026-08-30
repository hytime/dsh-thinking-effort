import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const MARKER = join(process.env.DSH_HOME || process.cwd(), 'thinking-effort-loaded.json');
export function mark(event) {
    try {
        writeFileSync(MARKER, JSON.stringify({
            event,
            at: new Date().toISOString(),
            pid: process.pid,
        }, null, 2));
    }
    catch {
        // Marker diagnostics must not block plugin activation.
    }
}
//# sourceMappingURL=marker.js.map