import type { Report } from '@lexvision/types';
import { auth } from './auth';

const API_BASE_URL = 'http://localhost:8000/api';

interface CitizenReportPayload {
    violationType: Report['violationType'];
    datetime: string;
    location: Report['location'];
    evidence: Array<{
        id?: string;
        type: 'image' | 'video';
        url: string;
        name: string;
        size: number;
        mimeType?: string;
    }>;
    vehicle: Report['vehicle'];
}

const getHeaders = (token?: string) => {
    const session = auth.getSession();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const bearerToken = token || session?.token;
    if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    return headers;
};

const mapBackendStatus = (status: string): Report['status'] =>
    status === 'SUBMITTED' ? 'submitted' :
        status === 'CLOSED' ? 'closed' :
        status === 'VALIDATED' ? 'verified' :
            status === 'REJECTED' ? 'rejected' : 'under-review';

const mapReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'legacy-report',
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
    status: mapBackendStatus(b.status),
    createdAt: b.created_at,
    updatedAt: b.updated_at || b.created_at,
    aiAnalysis: b.inference_log ? {
        detectedViolationType: b.violation_type,
        detectedPlate: b.inference_log.ocr_text,
        confidence: b.inference_log.confidence
    } : undefined
});

const mapCitizenReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'evidence-report',
    citizen: { phone: b.citizen?.phone_number },
    violationType: b.violation_type as any,
    datetime: b.incident_at,
    location: {
        lat: b.location_lat,
        lng: b.location_lng,
        address: b.location_address,
        city: b.location_city,
    },
    evidence: (b.files || []).map((file: any, index: number) => ({
        id: file.id || `citizen-file-${index}`,
        type: file.file_type,
        url: file.storage_url,
        name: file.original_name,
        size: file.size_bytes,
    })),
    vehicle: {
        plate: b.vehicle_plate,
        type: b.vehicle_type,
        notes: b.description,
    },
    status: mapBackendStatus(b.status),
    createdAt: b.created_at,
    updatedAt: b.updated_at || b.created_at,
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

    submitCitizenReportWithFirebase: async (firebaseIdToken: string, reportData: CitizenReportPayload): Promise<Report> => {
        const citizenAuth = await auth.loginCitizenWithFirebaseToken(firebaseIdToken);

        const payload = {
            violation_type: reportData.violationType,
            incident_at: reportData.datetime,
            location_lat: reportData.location.lat,
            location_lng: reportData.location.lng,
            location_address: reportData.location.address,
            location_city: reportData.location.city,
            description: reportData.vehicle.notes,
            vehicle_plate: reportData.vehicle.plate,
            vehicle_type: reportData.vehicle.type,
            evidence: reportData.evidence.map((e) => ({
                type: e.type,
                url: e.url,
                name: e.name,
                size: e.size,
                mime_type: e.mimeType,
            })),
        };

        const response = await fetch(`${API_BASE_URL}/citizen-reports`, {
            method: 'POST',
            headers: getHeaders(citizenAuth.access_token),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.detail ||
                'Your phone number was verified, but the evidence report could not be submitted. Your draft is still saved, so you can try again.'
            );
        }

        const data = await response.json();
        return mapCitizenReportToFrontend(data);
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/tracking/${trackingId}`);
            if (response.ok) {
                const data = await response.json();
                return mapReportToFrontend(data);
            }

            const citizenResponse = await fetch(`${API_BASE_URL}/citizen-reports/tracking/${trackingId}`);
            if (!citizenResponse.ok) return null;
            const citizenData = await citizenResponse.json();
            return mapCitizenReportToFrontend(citizenData);
        } catch { return null; }
    },

    getReportById: async (id: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/${id}`, { headers: getHeaders() });
            if (response.ok) {
                const data = await response.json();
                return mapReportToFrontend(data);
            }

            if (response.status !== 404) return null;

            const evidenceResponse = await fetch(`${API_BASE_URL}/evidence-reports/${id}`, { headers: getHeaders() });
            if (!evidenceResponse.ok) return null;
            const evidenceData = await evidenceResponse.json();
            return mapCitizenReportToFrontend(evidenceData);
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            return null;
        }
    },

    getAllReports: async (): Promise<Report[]> => {
        try {
            const [legacyResponse, evidenceResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/reports`, { headers: getHeaders() }),
                fetch(`${API_BASE_URL}/evidence-reports`, { headers: getHeaders() }),
            ]);

            const legacyReports = legacyResponse.ok
                ? (await legacyResponse.json()).map(mapReportToFrontend)
                : [];
            const evidenceReports = evidenceResponse.ok
                ? (await evidenceResponse.json()).map(mapCitizenReportToFrontend)
                : [];

            return [...legacyReports, ...evidenceReports];
        } catch { return []; }
    },

    updateReportStatus: async (report: Pick<Report, 'id' | 'source'>, status: Report['status'], notes?: string): Promise<Report | null> => {
        try {
            const backendStatus = status === 'verified' ? 'VALIDATED' :
                status === 'closed' ? 'CLOSED' :
                status === 'rejected' ? 'REJECTED' :
                    status === 'under-review' ? 'UNDER_REVIEW' : 'SUBMITTED';
            const endpoint = report.source === 'evidence-report'
                ? `${API_BASE_URL}/evidence-reports/${report.id}/status`
                : `${API_BASE_URL}/reports/${report.id}/status`;
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ status: backendStatus, notes }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to update report status');
            }
            const data = await response.json();
            return report.source === 'evidence-report'
                ? mapCitizenReportToFrontend(data)
                : mapReportToFrontend(data);
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
    },

    adminGetReportsTrend: async (): Promise<{ date: string, count: number }[]> => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/reports-trend`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    adminGetAiMetrics: async (): Promise<{ avg_helmet_confidence: number, avg_ocr_confidence: number, avg_inference_latency_seconds: number }> => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/ai-metrics`, { headers: getHeaders() });
        if (!response.ok) return { avg_helmet_confidence: 0, avg_ocr_confidence: 0, avg_inference_latency_seconds: 0 };
        return response.json();
    },

    adminGetOfficerMetrics: async (): Promise<{ officer_id: string, total_validations: number, tickets_issued: number, approval_rate_percent: number }[]> => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/officers`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    adminGetHeatmapData: async (): Promise<{ lat: number, lng: number, weight: number }[]> => {
        const response = await fetch(`${API_BASE_URL}/admin/analytics/heatmap`, { headers: getHeaders() });
        if (!response.ok) return [];
        return response.json();
    },

    issueTicket: async (reportId: string, penalCode: string, fineAmount: number) => {
        const response = await fetch(`${API_BASE_URL}/reports/${reportId}/ticket`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ report_id: reportId, penal_code: penalCode, fine_amount: fineAmount })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to issue ticket');
        }
        return response.json();
    },

    getTicketForReport: async (_reportId: string) => {
        try {
            // We'll check the report data for ticket info - for now return null
            // as there's no direct GET ticket by report endpoint
            return null;
        } catch { return null; }
    }
};
