import { HostContext, HostSettings } from './types.js';
export declare const STANDARD_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export type StandardLevel = (typeof STANDARD_LEVELS)[number];
type Logger = (...args: unknown[]) => void;
export declare function readSubagentEffort(settings: HostSettings | undefined, logger?: Logger): string | undefined;
export declare function resolveSubagentEffort(settings: HostSettings | undefined, config: unknown, logger?: Logger): StandardLevel | string | undefined;
export declare function handleAgentRequest(ctx: Pick<HostContext, 'settings'>, payload: unknown, next: () => Promise<unknown>): Promise<unknown>;
export {};
