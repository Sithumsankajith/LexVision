import type { CitizenReportDetail, Report, ReportStatusHistoryEntry, ReportStatusSource, TicketStatus, TicketStatusHistoryEntry, TrafficTicket } from '@lexvision/types';
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

const mapBackendStatusSource = (source: string): ReportStatusSource =>
    source === 'ML_WORKER' ? 'ml-worker' :
        source === 'POLICE' ? 'police' :
            source === 'ADMIN' ? 'admin' :
                source === 'CITIZEN' ? 'citizen' : 'system';

const requireCitizenSessionToken = () => {
    const session = auth.getCitizenSession();
    if (!session?.token) {
        throw new Error('Please verify your phone number to access your reports.');
    }
    return session.token;
};

const getEffectiveViolationType = (backendReport: any): Report['violationType'] =>
    (backendReport.violation_type ||
        backendReport.inferred_violation_type ||
        backendReport.claimed_violation_type ||
        'unclassified') as Report['violationType'];

const buildAiAnalysis = (backendReport: any): Report['aiAnalysis'] | undefined => {
    if (!backendReport.inference_log) {
        return undefined;
    }

    const bboxPayload = backendReport.inference_log.bbox_coordinates || {};
    const ocrOutput = bboxPayload.ocr_output || {};

    return {
        detectedViolationType: backendReport.inferred_violation_type || null,
        claimedViolationType: backendReport.claimed_violation_type || null,
        inferredViolationType: backendReport.inferred_violation_type || null,
        finalViolationType: backendReport.violation_type || null,
        detectedPlate: backendReport.inference_log.ocr_text || bboxPayload.plate_text || null,
        confidence: backendReport.inference_log.confidence,
        confidenceBand: bboxPayload.confidence_band || null,
        modelVersion: backendReport.inference_log.model_version || null,
        bbox: bboxPayload.bbox || null,
        ocrOutput: {
            text: backendReport.inference_log.ocr_text || bboxPayload.plate_text || null,
            rawText: ocrOutput.raw_text || null,
            confidence: backendReport.inference_log.ocr_confidence ?? bboxPayload.plate_confidence ?? null,
            validationStatus: bboxPayload.validation_status || null,
        },
        processedAt: backendReport.inference_log.timestamp || bboxPayload.processing_timestamp || null,
    };
};

const mapReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'legacy-report',
    citizen: { email: 'citizen@lexvision.gov' }, // Placeholder as backend doesn't embed user email
    violationType: getEffectiveViolationType(b),
    claimedViolationType: b.claimed_violation_type || null,
    inferredViolationType: b.inferred_violation_type || null,
    finalViolationType: b.violation_type || null,
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
    aiAnalysis: buildAiAnalysis(b),
});

const mapCitizenReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'evidence-report',
    citizen: { phone: b.citizen?.phone_number },
    violationType: b.violation_type as any,
    claimedViolationType: b.violation_type || null,
    inferredViolationType: null,
    finalViolationType: (b.status === 'VALIDATED' || b.status === 'CLOSED') ? b.violation_type || null : null,
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

const mapCitizenReportDetailToFrontend = (b: any): CitizenReportDetail => ({
    ...mapCitizenReportToFrontend(b),
    statusHistory: (b.status_history || []).map((entry: any): ReportStatusHistoryEntry => ({
        id: entry.id,
        previousStatus: entry.previous_status ? mapBackendStatus(entry.previous_status) : null,
        newStatus: mapBackendStatus(entry.new_status),
        notes: entry.notes || undefined,
        changedAt: entry.changed_at,
        source: mapBackendStatusSource(entry.change_source),
    })),
});

// ---------------------------------------------------------------------------
// Ticket mapping helpers
// ---------------------------------------------------------------------------

const mapBackendTicketStatus = (status: string): TicketStatus =>
    status === 'DRAFT' ? 'draft' :
        status === 'ISSUED' ? 'issued' :
            status === 'NOTIFIED' ? 'notified' :
                status === 'PAID' ? 'paid' :
                    status === 'OVERDUE' ? 'overdue' :
                        status === 'APPEALED' ? 'appealed' :
                            status === 'CANCELLED' ? 'cancelled' :
                                'closed';

const mapTicketToFrontend = (ticket: any): TrafficTicket => ({
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    reportId: ticket.report_id,
    evidenceReportId: ticket.evidence_report_id,
    officerId: ticket.officer_id,
    status: ticket.status.toLowerCase() as TrafficTicket['status'],
    fineRuleId: ticket.fine_rule_id,
    fineRuleVersion: ticket.fine_rule_version,
    penalCode: ticket.penal_code,
    fineAmount: ticket.fine_amount,
    fineOverrideReason: ticket.fine_override_reason,
    violationType: ticket.violation_type,
    vehiclePlate: ticket.vehicle_plate || null,
    offenderName: ticket.offender_name || null,
    offenderContact: ticket.offender_contact || null,
    dueDate: ticket.due_date || null,
    paidAt: ticket.paid_at || null,
    paymentReference: ticket.payment_reference || null,
    appealReason: ticket.appeal_reason || null,
    appealedAt: ticket.appealed_at || null,
    cancelledAt: ticket.cancelled_at || null,
    cancelledReason: ticket.cancelled_reason || null,
    notes: ticket.notes || null,
    issuedAt: ticket.issued_at || null,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at || ticket.created_at,
    statusHistory: (ticket.status_history || []).map((entry: any): TicketStatusHistoryEntry => ({
        id: entry.id,
        previousStatus: entry.previous_status ? mapBackendTicketStatus(entry.previous_status) : undefined,
        newStatus: mapBackendTicketStatus(entry.new_status),
        changeSource: mapBackendStatusSource(entry.change_source),
        notes: entry.notes || null,
        details: entry.details || null,
        changedAt: entry.changed_at,
    })),
});

const mapFineRuleToFrontend = (rule: any) => {
    return {
        id: rule.id,
        violationType: rule.violation_type,
        penalCode: rule.penal_code,
        fineAmount: rule.fine_amount,
        currency: rule.currency,
        description: rule.description,
        severity: rule.severity,
        active: rule.active,
        version: rule.version,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at,
    };
};

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
        const citizenAuth = await auth.loginCitizenWithFirebaseToken(firebaseIdToken, { persistSession: true });

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

    getCitizenMyReports: async (): Promise<Report[]> => {
        const token = requireCitizenSessionToken();
        const response = await fetch(`${API_BASE_URL}/citizen-reports/me`, {
            headers: getHeaders(token),
        });

        if (response.status === 401) {
            auth.logoutCitizen();
            throw new Error('Your citizen session has expired. Please verify your phone number again.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to load your reports.');
        }

        const data = await response.json();
        return data.map((report: any) => ({
            id: report.id,
            trackingId: report.tracking_id,
            source: 'evidence-report',
            citizen: { phone: auth.getCitizenSession()?.phone_number },
            violationType: report.violation_type,
            datetime: report.created_at,
            location: { lat: 0, lng: 0, address: '', city: '' },
            evidence: [],
            vehicle: {},
            status: mapBackendStatus(report.status),
            createdAt: report.created_at,
            updatedAt: report.updated_at,
        }));
    },

    getCitizenMyReportById: async (reportId: string): Promise<CitizenReportDetail | null> => {
        const token = requireCitizenSessionToken();
        const response = await fetch(`${API_BASE_URL}/citizen-reports/me/${reportId}`, {
            headers: getHeaders(token),
        });

        if (response.status === 401) {
            auth.logoutCitizen();
            throw new Error('Your citizen session has expired. Please verify your phone number again.');
        }

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to load this report.');
        }

        const data = await response.json();
        return mapCitizenReportDetailToFrontend(data);
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

    // --- Fine Rules Engine Methods ---
    getFineRules: async () => {
        const response = await fetch(`${API_BASE_URL}/fine-rules`, {
            headers: getHeaders(),
        });
        if (!response.ok) throw new Error('Failed to fetch fine rules');
        const data = await response.json();
        return data.map(mapFineRuleToFrontend);
    },

    getFineRuleByViolation: async (violationType: string) => {
        const response = await fetch(`${API_BASE_URL}/fine-rules/${violationType}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('Failed to fetch fine rule');
        }
        const data = await response.json();
        return mapFineRuleToFrontend(data);
    },

    issueTicket: async (
        reportId: string,
        penalCode: string | null,
        fineAmount: number | null,
        options?: {
            evidenceReportId?: string;
            violationType?: string;
            vehiclePlate?: string;
            offenderName?: string;
            offenderContact?: string;
            notes?: string;
            issueImmediately?: boolean;
            overrideReason?: string;
        },
    ) => {
        const useNewApi = !!options?.evidenceReportId;

        const payload = useNewApi
            ? {
                evidence_report_id: options!.evidenceReportId,
                penal_code: penalCode,
                fine_amount: fineAmount,
                fine_override_reason: options?.overrideReason,
                violation_type: options?.violationType,
                vehicle_plate: options?.vehiclePlate,
                offender_name: options?.offenderName,
                notes: options?.notes,
                issue_immediately: options?.issueImmediately ?? true,
            }
            : {
                report_id: reportId,
                penal_code: penalCode,
                fine_amount: fineAmount,
                fine_override_reason: options?.overrideReason,
                violation_type: options?.violationType,
                vehicle_plate: options?.vehiclePlate,
                offender_name: options?.offenderName,
                notes: options?.notes,
                issue_immediately: options?.issueImmediately ?? true,
            };

        const url = useNewApi
            ? `${API_BASE_URL}/tickets`
            : `${API_BASE_URL}/reports/${reportId}/ticket`;

        const response = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to issue ticket');
        }
        return mapTicketToFrontend(await response.json());
    },

    getTicketForReport: async (reportId: string, source?: string) => {
        try {
            const endpoint = source === 'evidence-report'
                ? `${API_BASE_URL}/tickets/by-evidence-report/${reportId}`
                : `${API_BASE_URL}/tickets/by-report/${reportId}`;
            const response = await fetch(endpoint, { headers: getHeaders() });
            if (!response.ok) return null;
            return mapTicketToFrontend(await response.json());
        } catch { return null; }
    },

    getTicketById: async (ticketId: string) => {
        const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch ticket');
        }
        return mapTicketToFrontend(await response.json());
    },

    updateTicketStatus: async (
        ticketId: string,
        status: string,
        options?: {
            notes?: string;
            paymentReference?: string;
            appealReason?: string;
            cancelledReason?: string;
        },
    ) => {
        const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/status`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({
                status: status.toUpperCase(),
                notes: options?.notes,
                payment_reference: options?.paymentReference,
                appeal_reason: options?.appealReason,
                cancelled_reason: options?.cancelledReason,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to update ticket status');
        }
        return mapTicketToFrontend(await response.json());
    },

    getAllTickets: async (statusFilter?: string) => {
        const params = statusFilter ? `?status=${statusFilter.toUpperCase()}` : '';
        const response = await fetch(`${API_BASE_URL}/tickets${params}`, {
            headers: getHeaders(),
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.map(mapTicketToFrontend);
    },
};

