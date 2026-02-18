import { SessionRiskLevel } from './types.ts';

/**
 * Normalizes a raw string value into a valid SessionRiskLevel.
 * Maps 'warn', 'high' -> 'caution'.
 * Defaults to 'normal' if unknown.
 */
export const normalizeRiskLevel = (value: unknown): SessionRiskLevel => {
    if (value === 'stable') return 'stable';
    if (value === 'caution' || value === 'warn' || value === 'high') return 'caution';
    if (value === 'normal') return 'normal';
    return 'normal';
};
