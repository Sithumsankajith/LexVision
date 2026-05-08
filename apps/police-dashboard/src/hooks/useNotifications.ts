import { useEffect, useRef, useState, useCallback } from 'react';
import type { AppNotification } from '@lexvision/types';
import { auth, mockDb } from '@lexvision/api-client';

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

const isStaffAuth = (): boolean => {
    const session = auth.getSession();
    return session !== null && ['POLICE', 'ADMIN'].includes(session.role);
};

export const useNotifications = (): UseNotificationsResult => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const inflightRef = useRef<boolean>(false);

    const pollUnreadCount = useCallback(async () => {
        if (!isStaffAuth()) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
            const count = await mockDb.getStaffUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silently ignore polling errors
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!isStaffAuth()) return;
        if (inflightRef.current) return;
        inflightRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getStaffNotifications({ limit: 50 });
            setNotifications(result.items);
            setUnreadCount(result.unread_count);
        } catch (err) {
            const raw = err instanceof Error ? err.message : '';
            setError(raw && !raw.toLowerCase().includes('credential') ? raw : 'Could not load notifications.');
        } finally {
            inflightRef.current = false;
            setLoading(false);
        }
    }, []);

    const refresh = fetchNotifications;

    const markRead = useCallback(async (id: string) => {
        if (!isStaffAuth()) return;
        const previous = notifications;
        setNotifications(prev =>
            prev.map(n => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await mockDb.markStaffNotificationRead(id);
        } catch {
            setNotifications(previous);
            void pollUnreadCount();
        }
    }, [notifications, pollUnreadCount]);

    const markAllRead = useCallback(async () => {
        if (!isStaffAuth()) return;
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
        if (!isStaffAuth()) return;
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

    useEffect(() => {
        if (!isStaffAuth()) return;

        const startPolling = () => {
            if (intervalRef.current !== null) return;
            void pollUnreadCount();
            intervalRef.current = setInterval(pollUnreadCount, POLL_INTERVAL_MS);
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
    }, [pollUnreadCount]);

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
};
