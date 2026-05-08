import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppNotification } from '@lexvision/types';
import { mockDb, auth } from '@lexvision/api-client';

const POLL_INTERVAL_MS = 15_000;

export interface UseNotificationsResult {
    unreadCount: number;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    fetchNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
}

const isAdminAuth = (): boolean => {
    const session = auth.getSession();
    return Boolean(session && session.role === 'ADMIN');
};

export function useNotifications(): UseNotificationsResult {
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const inflightRef = useRef<boolean>(false);

    const fetchUnreadCount = useCallback(async () => {
        if (!isAdminAuth()) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
            const count = await mockDb.getStaffUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silent — polling errors must never surface to the UI
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!isAdminAuth()) return;
        if (inflightRef.current) return;
        inflightRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getStaffNotifications({ limit: 50 });
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

    const refresh = fetchNotifications;

    const markRead = useCallback(async (id: string) => {
        if (!isAdminAuth()) return;
        const previous = notifications;
        setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await mockDb.markStaffNotificationRead(id);
        } catch {
            // Rollback on failure
            setNotifications(previous);
            void fetchUnreadCount();
        }
    }, [notifications, fetchUnreadCount]);

    const markAllRead = useCallback(async () => {
        if (!isAdminAuth()) return;
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
        if (!isAdminAuth()) return;
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

    // Visibility-aware polling: pause when tab hidden, resume on visible
    useEffect(() => {
        if (!isAdminAuth()) return;

        const startPolling = () => {
            if (intervalRef.current !== null) return;
            void fetchUnreadCount();
            intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
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
    }, [fetchUnreadCount]);

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
