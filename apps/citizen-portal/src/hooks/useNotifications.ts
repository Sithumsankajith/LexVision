import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, mockDb } from '@lexvision/api-client';
import type { AppNotification } from '@lexvision/types';

const POLL_INTERVAL_MS = 30_000;

export interface UseNotificationsResult {
    unreadCount: number;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    fetchNotifications: (opts?: { offset?: number; limit?: number }) => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isAuthenticated = auth.isCitizenAuthenticated();

    const refreshUnreadCount = useCallback(async () => {
        if (!auth.isCitizenAuthenticated()) return;
        try {
            const count = await mockDb.getCitizenUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silently swallow — unread count failure must not break any page
        }
    }, []);

    // Start polling for unread count
    useEffect(() => {
        if (!isAuthenticated) {
            setUnreadCount(0);
            setNotifications([]);
            return;
        }

        // Initial fetch
        refreshUnreadCount();

        intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isAuthenticated, refreshUnreadCount]);

    const fetchNotifications = useCallback(async (opts: { offset?: number; limit?: number } = {}) => {
        if (!auth.isCitizenAuthenticated()) return;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getCitizenNotifications({
                limit: opts.limit ?? 20,
                offset: opts.offset ?? 0,
            });
            setNotifications(result.items);
            setUnreadCount(result.unread_count);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load notifications.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const markRead = useCallback(async (id: string) => {
        if (!auth.isCitizenAuthenticated()) return;
        try {
            await mockDb.markCitizenNotificationRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n),
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch {
            // Silently swallow
        }
    }, []);

    const markAllRead = useCallback(async () => {
        if (!auth.isCitizenAuthenticated()) return;
        try {
            await mockDb.markAllCitizenNotificationsRead();
            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })),
            );
            setUnreadCount(0);
        } catch {
            // Silently swallow
        }
    }, []);

    const deleteNotification = useCallback(async (id: string) => {
        if (!auth.isCitizenAuthenticated()) return;
        try {
            const wasUnread = notifications.find(n => n.id === id)?.is_read === false;
            await mockDb.deleteCitizenNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (wasUnread) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch {
            // Silently swallow
        }
    }, [notifications]);

    return {
        unreadCount,
        notifications,
        loading,
        error,
        fetchNotifications,
        markRead,
        markAllRead,
        deleteNotification,
    };
}
