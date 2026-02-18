import { supabase } from './supabase';

export const logError = async (message: string, context?: any, userId?: string) => {
    try {
        console.error(`[System Error] ${message}`, context);

        // Fire and forget - don't await this to prevent blocking UI
        supabase.from('system_logs').insert({
            level: 'error',
            message,
            context,
            user_id: userId || null,
        }).then(({ error }) => {
            if (error) console.error('Failed to save system log:', error);
        });

    } catch (err) {
        console.error('Logger failed:', err);
    }
};
