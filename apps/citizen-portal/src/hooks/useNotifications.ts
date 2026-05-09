import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, mockDb } from '@lexvision/api-client';
import type { AppNotification } from '@lexvision/types';

const POLL_INTERVAL_MS = 15_000;

export interface UseNotificationsResult {
    unreadCount: number;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    fetchNotifications: (opts?: { offset?: number; limit?: number }) => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const inflightRef = useRef<boolean>(false);

    const isAuthenticated = auth.hasCitizenPortalAccess();

    const refreshUnreadCount = useCallback(async () => {
        if (!auth.hasCitizenPortalAccess()) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
            const count = await mockDb.getStaffUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silent — never surface poll errors as UI errors
        }
    }, []);

    const fetchNotifications = useCallback(async (opts: { offset?: number; limit?: number } = {}) => {
        if (!auth.hasCitizenPortalAccess()) return;
        if (inflightRef.current) return;
        inflightRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getStaffNotifications({
                limit: opts.limit ?? 20,
                offset: opts.offset ?? 0,
            });
            setNotifications(result.items);
            setUnreadCount(result.unread_count);
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : '';
            setError(raw && !raw.toLowerCase().includes('credential') ? raw : 'Could not load notifications.');
        } finally {
            inflightRef.current = false;
            setLoading(false);
        }
    }, []);

    const refresh = useCallback(() => fetchNotifications(), [fetchNotifications]);

    const markRead = useCallback(async (id: string) => {
        if (!auth.hasCitizenPortalAccess()) return;
        const previous = notifications;
        setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)),
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await mockDb.markStaffNotificationRead(id);
        } catch {
            setNotifications(previous);
            void refreshUnreadCount();
        }
    }, [notifications, refreshUnreadCount]);

    const markAllRead = useCallback(async () => {
        if (!auth.hasCitizenPortalAccess()) return;
        const previous = notifications;
        const previousUnread = unreadCount;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
        setUnreadCount(0);
        try {
            await mockDb.markAllStaffNotificationsRead();
        } catch {
            setNotifications(previous);
            setUnreadCount(previousUnread);
        }
    }, [notifications, unreadCount]);

    const deleteNotification = useCallback(async (id: string) => {
        if (!auth.hasCitizenPortalAccess()) return;
        const previous = notifications;
        const wasUnread = previous.find(n => n.id === id)?.is_read === false;
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await mockDb.deleteStaffNotification(id);
        } catch {
            setNotifications(previous);
            if (wasUnread) setUnreadCount(prev => prev + 1);
        }
    }, [notifications]);

    // Visibility-aware polling
    useEffect(() => {
        if (!isAuthenticated) {
            setUnreadCount(0);
            setNotifications([]);
            return;
        }

        const startPolling = () => {
            if (intervalRef.current !== null) return;
            void refreshUnreadCount();
            intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
        };

        const stopPolling = () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                startPolling();
            } else {
                stopPolling();
            }
        };

        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            startPolling();
        }

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            stopPolling();
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [isAuthenticated, refreshUnreadCount]);

    return {
        unreadCount,
        notifications,
        loading,
        error,
        fetchNotifications,
        markRead,
        markAllRead,
        deleteNotification,
        refresh,
    };
}
