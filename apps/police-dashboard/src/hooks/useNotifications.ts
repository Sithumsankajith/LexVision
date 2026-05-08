import { useEffect, useRef, useState } from 'react';
import type { AppNotification } from '@lexvision/types';
import { auth, mockDb } from '@lexvision/api-client';

export interface UseNotificationsResult {
    unreadCount: number;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    fetchNotifications: () => Promise<void>;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
}

export const useNotifications = (): UseNotificationsResult => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isAuthenticated = (): boolean => {
        const session = auth.getSession();
        return session !== null && ['POLICE', 'ADMIN'].includes(session.role);
    };

    const pollUnreadCount = async () => {
        if (!isAuthenticated()) return;
        try {
            const count = await mockDb.getStaffUnreadCount();
            setUnreadCount(count);
        } catch {
            // Silently ignore polling errors
        }
    };

    const fetchNotifications = async () => {
        if (!isAuthenticated()) return;
        setLoading(true);
        setError(null);
        try {
            const result = await mockDb.getStaffNotifications({ limit: 50 });
            setNotifications(result.items);
            setUnreadCount(result.unread_count);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load notifications');
        } finally {
            setLoading(false);
        }
    };

    const markRead = async (id: string) => {
        if (!isAuthenticated()) return;
        try {
            await mockDb.markStaffNotificationRead(id);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch {
            // Silently ignore
        }
    };

    const markAllRead = async () => {
        if (!isAuthenticated()) return;
        try {
            await mockDb.markAllStaffNotificationsRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch {
            // Silently ignore
        }
    };

    useEffect(() => {
        if (!isAuthenticated()) return;

        // Initial poll
        pollUnreadCount();

        // Poll every 30 seconds
        intervalRef.current = setInterval(pollUnreadCount, 30_000);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        unreadCount,
        notifications,
        loading,
        error,
        fetchNotifications,
        markRead,
        markAllRead,
    };
};
