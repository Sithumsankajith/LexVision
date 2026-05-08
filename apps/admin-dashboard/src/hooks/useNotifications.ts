import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppNotification } from '@lexvision/types';
import { mockDb, auth } from '@lexvision/api-client';

const POLL_INTERVAL_MS = 30_000;

export interface UseNotificationsResult {
    unreadCount: number;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    fetchNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isAdminAuth = (): boolean => {
        const session = auth.getSession();
        return Boolean(session && session.role === 'ADMIN');
    };

    const fetchUnreadCount = useCallback(async () => {
        if (!isAdminAuth()) return;
        try {
            const count = await mockDb.getStaffUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silently fail for polling — don't surface poll errors as UI errors
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!isAdminAuth()) return;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getStaffNotifications({ limit: 50 });
            setNotifications(result.items);
            setUnreadCount(result.unread_count);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load notifications';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    const markRead = useCallback(async (id: string) => {
        if (!isAdminAuth()) return;
        try {
            await mockDb.markStaffNotificationRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to mark notification as read';
            setError(message);
        }
    }, []);

    const markAllRead = useCallback(async () => {
        if (!isAdminAuth()) return;
        try {
            await mockDb.markAllStaffNotificationsRead();
            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
            );
            setUnreadCount(0);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to mark all notifications as read';
            setError(message);
        }
    }, []);

    // Initial load + start polling
    useEffect(() => {
        if (!isAdminAuth()) return;

        fetchUnreadCount();

        intervalRef.current = setInterval(() => {
            fetchUnreadCount();
        }, POLL_INTERVAL_MS);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
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
    };
}
