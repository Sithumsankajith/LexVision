import type { Report } from './types';

// In-memory storage
let reports: Report[] = [];

// Helper to simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockDb = {
    createReport: async (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>): Promise<Report> => {
        await delay(800);
        const newReport: Report = {
            ...reportData,
            id: crypto.randomUUID(),
            // Tracking ID format: LEX-YYYY-XXXX (Random 4 alphanumeric)
            trackingId: `LEX-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            status: 'submitted',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        reports.push(newReport);
        return newReport;
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        await delay(600);
        return reports.find((r) => r.trackingId === trackingId) || null;
    },

    // For demo purposes, seed some data
    seed: () => {
        if (reports.length > 0) return;

        // Create a few sample reports if needed
        // ...
    }
};
