import type { Report, ViolationType } from '@lexvision/types';

const STORAGE_KEY = 'lexvision_mock_db';

// Helper to get reports from localStorage
const getReports = (): Report[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

// Helper to save reports to localStorage
const saveReports = (reports: Report[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
};

// Helper to simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockDb = {
    createReport: async (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>): Promise<Report> => {
        await delay(800);
        const reports = getReports();
        const newReport: Report = {
            ...reportData,
            id: crypto.randomUUID(),
            // Tracking ID format: LEX-YYYY-XXXX (Random 4 alphanumeric)
            trackingId: `LEX-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            status: 'submitted',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        saveReports([...reports, newReport]);
        return newReport;
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        await delay(600);
        const reports = getReports();
        return reports.find((r) => r.trackingId === trackingId) || null;
    },

    getReportById: async (id: string): Promise<Report | null> => {
        await delay(300);
        const reports = getReports();
        return reports.find((r) => r.id === id) || null;
    },

    getAllReports: async (): Promise<Report[]> => {
        await delay(500);
        return getReports();
    },

    updateReportStatus: async (id: string, status: Report['status'], notes?: string): Promise<Report | null> => {
        await delay(400);
        const reports = getReports();
        const reportIndex = reports.findIndex(r => r.id === id);
        if (reportIndex === -1) return null;

        reports[reportIndex] = {
            ...reports[reportIndex],
            status,
            updatedAt: new Date().toISOString(),
            ...(notes ? { notes: (reports[reportIndex].notes ? reports[reportIndex].notes + '\n' + notes : notes) } : {})
        };

        saveReports(reports);
        return reports[reportIndex];
    },

    // For demo purposes, seed some data
    seed: () => {
        const reports = getReports();
        if (reports.length > 0) return;

        // Seed initial data if empty
        const initialReports: Report[] = Array.from({ length: 5 }).map((_, i) => ({
            id: crypto.randomUUID(),
            trackingId: `LEX-2026-${1000 + i}`,
            citizen: { email: `citizen${i}@example.com` },
            violationType: (i % 3 === 0 ? 'red-light' : i % 3 === 1 ? 'helmet' : 'white-line') as ViolationType,
            datetime: new Date().toISOString(),
            location: {
                lat: 6.9271, lng: 79.8612,
                address: i % 2 === 0 ? 'Galle Rd, Col 03' : 'Union Place, Col 02',
                city: 'Colombo'
            },
            evidence: [{
                id: `ev-${i}`, type: 'image', url: 'https://via.placeholder.com/600x400', name: `capture_${i}.jpg`, size: 102400
            }],
            vehicle: {},
            status: i < 2 ? 'submitted' : i < 4 ? 'under-review' : 'verified',
            createdAt: new Date(Date.now() - i * 86400000).toISOString(),
            updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
        }));

        saveReports(initialReports);
    }
};
