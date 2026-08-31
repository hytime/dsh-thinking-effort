import type { ClientConnection, SettingsApi } from './types.js';
export declare function directResult<T>(response: unknown): T;
export declare function settingsBridge(connection: ClientConnection | undefined, remoteSettings?: unknown, addLanguage?: unknown): SettingsApi | undefined;
