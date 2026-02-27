import type { Report } from '@lexvision/types';

const API_BASE_URL = 'http://localhost:8000/api';

export const mockDb = {
    createReport: async (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>): Promise<Report> => {
        const response = await fetch(`${API_BASE_URL}/reports`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(reportData),
        });
        if (!response.ok) throw new Error('Failed to create report');
        return response.json();
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${trackingId}`);
            if (!response.ok) return null;
            return response.json();
        } catch {
            return null;
        }
    },

    getReportById: async (id: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${id}`);
            if (!response.ok) return null;
            return response.json();
        } catch {
            return null;
        }
    },

    getAllReports: async (): Promise<Report[]> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports`);
            if (!response.ok) return [];
            return response.json();
        } catch {
            return [];
        }
    },

    updateReportStatus: async (id: string, status: Report['status'], notes?: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status, notes }),
            });
            if (!response.ok) return null;
            return response.json();
        } catch {
            return null;
        }
    },

    seed: () => {
        // Seeding is now handled directly by the Python backend on startup.
    }
};
