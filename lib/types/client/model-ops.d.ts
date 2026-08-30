import type { InventoryItem, ModelUpdate, SettingsOp } from './types.js';
export declare function mergeModelUpdate(raw: Record<string, unknown>, update: ModelUpdate): Record<string, unknown>;
export declare function setOps(inventory: readonly InventoryItem[], updates: readonly ModelUpdate[]): SettingsOp[];
