import type { Report } from '@lexvision/types';
import { auth } from './auth';

const API_BASE_URL = 'http://localhost:8000/api';

const getHeaders = () => {
    const session = auth.getSession();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (session?.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
    }
    return headers;
};

const mapReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    citizen: { email: 'citizen@lexvision.gov' }, // Placeholder as backend doesn't embed user email
    violationType: b.violation_type as any,
    datetime: b.datetime,
    location: {
        lat: b.location_lat,
        lng: b.location_lng,
        address: b.location_address,
        city: b.location_city
    },
    evidence: b.evidence || [],
    vehicle: { plate: b.inference_log?.ocr_text || b.vehicle_plate },
    status: b.status === 'SUBMITTED' ? 'submitted' :
        b.status === 'VALIDATED' ? 'verified' :
            b.status === 'REJECTED' ? 'rejected' : 'under-review',
    createdAt: b.created_at,
    updatedAt: b.updated_at || b.created_at,
    aiAnalysis: b.inference_log ? {
        detectedViolationType: b.violation_type,
        detectedPlate: b.inference_log.ocr_text,
        confidence: b.inference_log.confidence
    } : undefined
});

export const mockDb = {
    createReport: async (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>): Promise<Report> => {
        const payload = {
            violation_type: reportData.violationType,
            datetime: reportData.datetime,
            location_lat: reportData.location.lat,
            location_lng: reportData.location.lng,
            location_address: reportData.location.address,
            location_city: reportData.location.city,
            evidence: reportData.evidence.map((e: any) => ({
                id: e.id,
                type: e.type,
                url: e.url,
                name: e.name,
                size: e.size
            }))
        };
        const response = await fetch(`${API_BASE_URL}/reports`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to create report');
        }
        const data = await response.json();
        return mapReportToFrontend(data);
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/tracking/${trackingId}`);
            if (!response.ok) return null;
            const data = await response.json();
            return mapReportToFrontend(data);
        } catch { return null; }
    },

    getReportById: async (id: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${id}`, { headers: getHeaders() });
            if (!response.ok) return null;
            const data = await response.json();
            return mapReportToFrontend(data);
        } catch { return null; }
    },

    getAllReports: async (): Promise<Report[]> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports`, { headers: getHeaders() });
            if (!response.ok) return [];
            const data = await response.json();
            return data.map(mapReportToFrontend);
        } catch { return []; }
    },

    updateReportStatus: async (id: string, status: Report['status'], notes?: string): Promise<Report | null> => {
        try {
            const backendStatus = status === 'verified' ? 'VALIDATED' :
                status === 'rejected' ? 'REJECTED' :
                    status === 'under-review' ? 'UNDER_REVIEW' : 'SUBMITTED';
            const response = await fetch(`${API_BASE_URL}/reports/${id}/status`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ status: backendStatus, notes }),
            });
            if (!response.ok) return null;
            const data = await response.json();
            return mapReportToFrontend(data);
        } catch { return null; }
    },

    // --- User & Reward Methods ---
    getProfile: async () => {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch profile');
        return response.json();
    },

    getMyReports: async (): Promise<Report[]> => {
        const response = await fetch(`${API_BASE_URL}/users/me/reports`, {
            headers: getHeaders()
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.map(mapReportToFrontend);
    },

    listRewards: async () => {
        const response = await fetch(`${API_BASE_URL}/users/rewards`, {
            headers: getHeaders()
        });
        if (!response.ok) return [];
        return response.json();
    },

    claimReward: async (rewardId: string) => {
        const response = await fetch(`${API_BASE_URL}/users/rewards/claim/${rewardId}`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to claim reward');
        }
        return response.json();
    },

    seed: () => {
        // Seeding is now handled directly by the Python backend on startup.
    },

    // --- Admin Endpoints ---
    adminGetUsers: async () => {
        const response = await fetch(`${API_BASE_URL}/users`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    adminCreateUser: async (user: any) => {
        const response = await fetch(`${API_BASE_URL}/users`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(user)
        });
        if (!response.ok) throw new Error('Failed to create user');
        return response.json();
    },

    adminGetAuditLogs: async () => {
        const response = await fetch(`${API_BASE_URL}/admin/audit-logs`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    adminGetViolationTypes: async () => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/violation-types`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    adminGetStatusRatio: async () => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/status-ratio`, { headers: getHeaders() });
        if (!response.ok) return { total: 0, validated: 0, rejected: 0, ratio_validated: 0, ratio_rejected: 0 };
        return response.json();
    },

    adminUpdateAiThreshold: async (threshold: number) => {
        const response = await fetch(`${API_BASE_URL}/admin/configuration/ai-threshold?threshold=${threshold}`, {
            method: 'POST',
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to update threshold');
        return response.json();
    },

    adminExportReportsCsv: async () => {
        const response = await fetch(`${API_BASE_URL}/admin/export/reports`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to export CSV');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lexvision-reports-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
};
