import type { AppNotification, CitizenReportDetail, ConfidenceBand, NotificationListResult, PlateReview, Report, ReportStatusSource, TicketStatus, TicketStatusHistoryEntry, TrafficTicket } from '@lexvision/types';

const extractErrorMessage = (errorData: any, fallback: string) => {
    if (typeof errorData?.detail === 'string') {
        return errorData.detail;
    }
    if (Array.isArray(errorData?.detail)) {
        return errorData.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
    }
    return fallback;
};

import { API_BASE_URL, API_ORIGIN, apiFetch, auth, getResponseErrorMessage } from './auth';

const normalizeViolationType = (value?: string | null): Report['violationType'] => {
    if (!value) {
        return 'unclassified';
    }
    const normalized = value.toLowerCase().replace(/-/g, '_');
    if (normalized === 'red_light' || normalized === 'white_line' || normalized === 'helmet' || normalized === 'other') {
        return normalized as Report['violationType'];
    }
    return value as Report['violationType'];
};

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

const redirectToLoginAfterAuthFailure = () => {
    auth.logout();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
};

const ensureOk = async (response: Response, fallback: string) => {
    if (response.status === 401) {
        const message = await getResponseErrorMessage(response, 'Session expired. Please sign in again.');
        redirectToLoginAfterAuthFailure();
        throw new Error(message);
    }
    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response, fallback));
    }
};

const resolveMediaUrl = (url?: string | null): string => {
    if (!url) {
        return '';
    }
    if (url.startsWith('/api/')) {
        return `${API_ORIGIN}${url}`;
    }
    return url;
};

const resolvePlateCropUrl = (url?: string | null): string | null => {
    if (!url) {
        return null;
    }
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    if (url.startsWith('/api/')) {
        return `${API_ORIGIN}${url}`;
    }
    const parts = url.split(/[\\/]/);
    const filename = parts[parts.length - 1];
    if (filename && (url.includes('storage/plate_crops') || url.includes('plate_crops'))) {
        return `${API_ORIGIN}/api/media/plate-crops/${encodeURIComponent(filename)}`;
    }
    return url;
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

const getEffectiveViolationType = (backendReport: any): Report['violationType'] =>
    normalizeViolationType(backendReport.violation_type ||
        backendReport.inferred_violation_type ||
        backendReport.inference_log?.bbox_coordinates?.inferred_violation_type ||
        backendReport.claimed_violation_type ||
        backendReport.inference_log?.bbox_coordinates?.claimed_violation_type ||
        'unclassified');

const getClaimedViolationType = (backendReport: any): string | null =>
    normalizeViolationType(backendReport.claimed_violation_type
    || backendReport.inference_log?.bbox_coordinates?.claimed_violation_type
    || backendReport.violation_type
    || null) || null;

const getInferredViolationType = (backendReport: any): string | null =>
    backendReport.inferred_violation_type
    || backendReport.inference_log?.bbox_coordinates?.inferred_violation_type
    || null;

const getFinalViolationType = (backendReport: any): string | null => {
    if (backendReport.final_violation_type) {
        return backendReport.final_violation_type;
    }
    if (backendReport.status === 'VALIDATED' || backendReport.status === 'CLOSED') {
        return backendReport.violation_type || null;
    }
    return null;
};

const normalizeConfidenceBand = (value: any): ConfidenceBand | null =>
    value === 'high' || value === 'medium' || value === 'low' ? value : null;

const mapDetectionToFrontend = (detection: any) => ({
    class: detection?.class || 'unknown',
    normalizedClass: detection?.normalized_class || null,
    confidence: typeof detection?.confidence === 'number' ? detection.confidence : 0,
    confidenceLevel: normalizeConfidenceBand(detection?.confidence_level),
    bbox: detection?.bbox ? {
        x: detection.bbox.x ?? null,
        y: detection.bbox.y ?? null,
        width: detection.bbox.width ?? null,
        height: detection.bbox.height ?? null,
        x1: detection.bbox.x1 ?? null,
        y1: detection.bbox.y1 ?? null,
        x2: detection.bbox.x2 ?? null,
        y2: detection.bbox.y2 ?? null,
    } : null,
    bboxXyxy: detection?.bbox_xyxy ? {
        x1: detection.bbox_xyxy.x1 ?? null,
        y1: detection.bbox_xyxy.y1 ?? null,
        x2: detection.bbox_xyxy.x2 ?? null,
        y2: detection.bbox_xyxy.y2 ?? null,
    } : null,
});

const mapPlateReviewToFrontend = (raw: any, fallbackPayload?: any, fallbackLog?: any): PlateReview => {
    const payload = raw || {};
    const bboxPayload = fallbackPayload || {};
    const plateBbox = payload.plate_bbox || bboxPayload.plate_bbox || bboxPayload.anpr_output?.plate_bbox || bboxPayload.anpr_output?.bbox || null;
    const plateConfidence = payload.plate_confidence ?? bboxPayload.plate_detection_confidence ?? bboxPayload.plate_confidence ?? bboxPayload.anpr_output?.plate_confidence ?? 0;
    const ocrConfidence = payload.ocr_confidence ?? bboxPayload.ocr_confidence ?? bboxPayload.anpr_output?.ocr_confidence ?? fallbackLog?.ocr_confidence ?? 0;
    const level = normalizeConfidenceBand(payload.confidence_level)
        || (plateConfidence >= 0.8 && ocrConfidence >= 0.8 ? 'high' : plateConfidence >= 0.5 && ocrConfidence >= 0.5 ? 'medium' : 'low');

    return {
        plateDetected: !!(payload.plate_detected ?? bboxPayload.plate_detected ?? bboxPayload.anpr_output?.plate_detected),
        plateText: payload.plate_text ?? bboxPayload.plate_text ?? bboxPayload.anpr_output?.plate_text ?? null,
        normalizedPlateText: payload.normalized_plate_text ?? bboxPayload.normalized_plate_text ?? bboxPayload.anpr_output?.normalized_plate_text ?? fallbackLog?.ocr_text ?? null,
        confidenceLevel: level,
        plateConfidence: typeof plateConfidence === 'number' ? plateConfidence : Number(plateConfidence) || 0,
        ocrConfidence: typeof ocrConfidence === 'number' ? ocrConfidence : Number(ocrConfidence) || 0,
        plateBbox: plateBbox ? {
            x: plateBbox.x ?? null,
            y: plateBbox.y ?? null,
            width: plateBbox.width ?? null,
            height: plateBbox.height ?? null,
            x1: plateBbox.x1 ?? null,
            y1: plateBbox.y1 ?? null,
            x2: plateBbox.x2 ?? null,
            y2: plateBbox.y2 ?? null,
        } : null,
        cropPath: resolvePlateCropUrl(payload.crop_path ?? bboxPayload.crop_path ?? bboxPayload.anpr_output?.crop_path ?? null),
        status: payload.status ?? bboxPayload.anpr_status ?? bboxPayload.anpr_output?.status ?? null,
        validationStatus: payload.validation_status ?? bboxPayload.validation_status ?? bboxPayload.anpr_output?.validation_status ?? null,
        error: payload.error ?? bboxPayload.anpr_error ?? bboxPayload.anpr_output?.error ?? null,
        manualCorrection: payload.manual_correction ?? bboxPayload.manual_plate_correction?.corrected_plate_number ?? null,
        manualCorrectionAt: payload.manual_correction_at ?? bboxPayload.manual_plate_correction?.corrected_at ?? null,
    };
};

const buildAiSummary = (backendReport: any): Report['aiSummary'] | undefined => {
    const rawSummary = backendReport.ai_summary;
    console.log('[DEBUG mockDb] backendReport.ai_summary:', rawSummary);
    if (rawSummary) {
        const bboxPayload = backendReport.inference_log?.bbox_coordinates || {};
        return {
            violationFamily: rawSummary.violation_family || null,
            provider: rawSummary.provider || null,
            modelId: rawSummary.model_id || null,
            claimedViolationType: normalizeViolationType(rawSummary.claimed_violation_type || null) || null,
            inferredViolationType: rawSummary.inferred_violation_type || null,
            finalViolationType: rawSummary.final_violation_type || getFinalViolationType(backendReport),
            hasViolation: !!(rawSummary.has_violation ?? rawSummary.has_helmet_violation),
            hasHelmetViolation: !!rawSummary.has_helmet_violation,
            confidence: typeof rawSummary.confidence === 'number' ? rawSummary.confidence : 0,
            confidenceLevel: normalizeConfidenceBand(rawSummary.confidence_level) || 'none',
            manualReviewRequired: !!rawSummary.manual_review_required,
            reviewReason: rawSummary.review_reason || null,
            detectedClasses: Array.isArray(rawSummary.detected_classes) ? rawSummary.detected_classes : [],
            detections: Array.isArray(rawSummary.detections) ? rawSummary.detections.map(mapDetectionToFrontend) : [],
            error: rawSummary.error || null,
            status: rawSummary.status || null,
            processedAt: rawSummary.processed_at || null,
            plateReview: mapPlateReviewToFrontend(rawSummary.plate_review, bboxPayload, backendReport.inference_log),
        };
    }

    if (!backendReport.inference_log) {
        return undefined;
    }

    const bboxPayload = backendReport.inference_log.bbox_coordinates || {};
    const modelVersion = bboxPayload.model_version || {};
    const fallbackModelId = typeof backendReport.inference_log.model_version === 'string'
        ? backendReport.inference_log.model_version.split('|', 1)[0]
        : backendReport.inference_log.model_version || null;
    return {
        violationFamily: bboxPayload.violation_family || null,
        provider: bboxPayload.violation_provider || null,
        modelId: (typeof modelVersion === 'object' && modelVersion ? (modelVersion.violation || modelVersion.helmet) : null) || bboxPayload.violation_model_id || fallbackModelId,
        claimedViolationType: normalizeViolationType(bboxPayload.claimed_violation_type || getClaimedViolationType(backendReport)) || null,
        inferredViolationType: bboxPayload.inferred_violation_type || getInferredViolationType(backendReport),
        finalViolationType: getFinalViolationType(backendReport),
        hasViolation: !!(bboxPayload.has_violation ?? bboxPayload.has_helmet_violation),
        hasHelmetViolation: !!bboxPayload.has_helmet_violation,
        confidence: typeof bboxPayload.violation_confidence === 'number' ? bboxPayload.violation_confidence : 0,
        confidenceLevel: normalizeConfidenceBand(bboxPayload.violation_confidence_level) || 'none',
        manualReviewRequired: !!bboxPayload.needs_manual_review,
        reviewReason: bboxPayload.violation_review_reason || null,
        detectedClasses: Array.isArray(bboxPayload.violation_detected_classes) ? bboxPayload.violation_detected_classes : [],
        detections: Array.isArray(bboxPayload.violation_detections) ? bboxPayload.violation_detections.map(mapDetectionToFrontend) : [],
        error: bboxPayload.violation_error || null,
        status: bboxPayload.violation_detection_status || null,
        processedAt: bboxPayload.processing_timestamp || backendReport.inference_log.timestamp || null,
        plateReview: mapPlateReviewToFrontend(null, bboxPayload, backendReport.inference_log),
    };
};

const buildAiAnalysis = (backendReport: any): Report['aiAnalysis'] | undefined => {
    const aiSummary = buildAiSummary(backendReport);
    if (!backendReport.inference_log && !aiSummary) {
        return undefined;
    }

    const bboxPayload = backendReport.inference_log?.bbox_coordinates || {};
    const ocrOutput = bboxPayload.ocr_output || {};

    return {
        detectedViolationType: aiSummary?.inferredViolationType || getInferredViolationType(backendReport),
        claimedViolationType: aiSummary?.claimedViolationType || getClaimedViolationType(backendReport),
        inferredViolationType: aiSummary?.inferredViolationType || getInferredViolationType(backendReport),
        finalViolationType: aiSummary?.finalViolationType || getFinalViolationType(backendReport),
        detectedPlate: backendReport.inference_log?.ocr_text || bboxPayload.plate_text || null,
        confidence: aiSummary?.confidence ?? backendReport.inference_log?.confidence,
        confidenceBand: aiSummary?.confidenceLevel || normalizeConfidenceBand(bboxPayload.confidence_band),
        modelVersion: aiSummary?.modelId || backendReport.inference_log?.model_version || null,
        bbox: bboxPayload.bbox || null,
        plateReview: aiSummary?.plateReview || mapPlateReviewToFrontend(null, bboxPayload, backendReport.inference_log),
        ocrOutput: {
            text: backendReport.inference_log?.ocr_text || bboxPayload.plate_text || null,
            rawText: ocrOutput.raw_text || null,
            confidence: backendReport.inference_log?.ocr_confidence ?? bboxPayload.ocr_confidence ?? null,
            validationStatus: bboxPayload.validation_status || null,
        },
        processedAt: aiSummary?.processedAt || backendReport.inference_log?.timestamp || bboxPayload.processing_timestamp || null,
    };
};

const mapReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'legacy-report',
    citizen: { email: 'citizen@lexvision.gov' }, // Placeholder as backend doesn't embed user email
    violationType: getEffectiveViolationType(b),
    claimedViolationType: getClaimedViolationType(b),
    inferredViolationType: getInferredViolationType(b),
    finalViolationType: getFinalViolationType(b),
    datetime: b.datetime,
    location: {
        lat: b.location_lat,
        lng: b.location_lng,
        address: b.location_address,
        city: b.location_city,
        district: b.location_district || '',
    },
    evidence: b.evidence || [],
    vehicle: { plate: b.inference_log?.ocr_text || b.vehicle_plate },
    status: mapBackendStatus(b.status),
    customViolationDescription: b.custom_violation_description || null,
    manualReviewRequired: !!b.manual_review_required,
    createdAt: b.created_at,
    updatedAt: b.updated_at || b.created_at,
    aiSummary: buildAiSummary(b),
    aiAnalysis: buildAiAnalysis(b),
});

const mapCitizenReportToFrontend = (b: any): Report => ({
    id: b.id,
    trackingId: b.tracking_id || b.id,
    source: 'evidence-report',
    citizen: { phone: b.citizen?.phone_number },
    violationType: getEffectiveViolationType(b),
    claimedViolationType: getClaimedViolationType(b),
    inferredViolationType: getInferredViolationType(b),
    finalViolationType: getFinalViolationType(b),
    datetime: b.incident_at,
    location: {
        lat: b.location_lat,
        lng: b.location_lng,
        address: b.location_address,
        city: b.location_city,
        district: b.location_district || '',
    },
    evidence: (b.files || []).map((file: any, index: number) => ({
        id: file.id || `citizen-file-${index}`,
        type: file.file_type,
        url: resolveMediaUrl(file.storage_url),
        name: file.original_name,
        size: file.size_bytes,
    })),
    vehicle: {
        plate: b.inference_log?.ocr_text || b.vehicle_plate,
        type: b.vehicle_type,
        notes: b.description,
    },
    status: mapBackendStatus(b.status),
    customViolationDescription: b.custom_violation_description || null,
    manualReviewRequired: !!b.manual_review_required,
    createdAt: b.created_at,
    updatedAt: b.updated_at || b.created_at,
    aiSummary: buildAiSummary(b),
    aiAnalysis: buildAiAnalysis(b),
});

const mapLegacyReportDetailToFrontend = (b: any): CitizenReportDetail => ({
    ...mapReportToFrontend(b),
    statusHistory: [],
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
    violationType: normalizeViolationType(ticket.violation_type),
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
        violationType: normalizeViolationType(rule.violation_type),
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

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result);
            return;
        }
        reject(new Error(`Failed to read ${file.name}`));
    };
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
});

const prepareLegacyReportEvidenceForSubmit = async (
    evidence: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>['evidence'],
) => {
    const prepared = [];
    for (const item of evidence as any[]) {
        const file = item.file as File | undefined;
        prepared.push({
            id: item.id,
            type: item.type,
            url: file ? await fileToDataUrl(file) : item.url || '',
            name: item.name,
            size: item.size,
        });
    }
    return prepared;
};

export const mockDb = {
    getEvidenceReportsPage: async (params: {
        limit?: number;
        offset?: number;
        status?: string;
        violationType?: string;
        district?: string;
        search?: string;
        sort?: string;
        dateFrom?: string;
        dateTo?: string;
    } = {}): Promise<{ items: Report[]; total: number; limit: number; offset: number }> => {
        const query = new URLSearchParams();
        query.set('limit', String(params.limit ?? 25));
        query.set('offset', String(params.offset ?? 0));
        if (params.status && params.status !== 'all') query.set('status', params.status);
        if (params.violationType && params.violationType !== 'all') query.set('violation_type', params.violationType);
        if (params.district && params.district !== 'all') query.set('district', params.district);
        if (params.search) query.set('search', params.search);
        if (params.sort) query.set('sort', params.sort);
        if (params.dateFrom) query.set('date_from', params.dateFrom);
        if (params.dateTo) query.set('date_to', params.dateTo);

        const response = await apiFetch(`${API_BASE_URL}/evidence-reports/page?${query.toString()}`, {
            headers: getHeaders(),
        });
        await ensureOk(response, 'Failed to load paginated reports.');
        const data = await response.json();
        return {
            items: data.items.map(mapCitizenReportToFrontend),
            total: data.total,
            limit: data.limit,
            offset: data.offset,
        };
    },

    createReport: async (reportData: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'trackingId'>): Promise<Report> => {
        const preparedEvidence = await prepareLegacyReportEvidenceForSubmit(reportData.evidence);
        const payload = {
            violation_type: normalizeViolationType(reportData.violationType),
            datetime: reportData.datetime,
            location_lat: reportData.location.lat,
            location_lng: reportData.location.lng,
            location_address: reportData.location.address,
            location_city: reportData.location.city,
            location_district: reportData.location.district,
            custom_violation_description: reportData.customViolationDescription,
            evidence: preparedEvidence,
        };
        const response = await fetch(`${API_BASE_URL}/reports`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (response.status === 401) {
            auth.logout();
            if (typeof window !== 'undefined') window.location.href = '/login';
            throw new Error('Your session has expired. Please sign in again.');
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to create report'));
        }
        const data = await response.json();
        return mapReportToFrontend(data);
    },

    getPortalMyReports: async (): Promise<Report[]> => {
        const authMode = auth.getCitizenPortalAuthMode();

        if (authMode === 'email') {
            return mockDb.getMyReports();
        }

        throw new Error('Please sign in with your citizen account to access your reports.');
    },

    getPortalMyReportById: async (reportId: string): Promise<CitizenReportDetail | null> => {
        const authMode = auth.getCitizenPortalAuthMode();

        if (authMode === 'email') {
            const report = await mockDb.getReportById(reportId);
            return report ? mapLegacyReportDetailToFrontend(report) : null;
        }

        throw new Error('Please sign in with your citizen account to access this report.');
    },

    getReportByTrackingId: async (trackingId: string): Promise<Report | null> => {
        try {
            const response = await fetch(`${API_BASE_URL}/reports/tracking/${trackingId}`);
            if (response.ok) {
                const data = await response.json();
                return mapReportToFrontend(data);
            }

            const citizenResponse = await fetch(`${API_BASE_URL}/citizen-reports/tracking/${trackingId}`);
            if (!citizenResponse.ok) {
                return null;
            }
            const citizenData = await citizenResponse.json();
            return mapCitizenReportToFrontend(citizenData);
        } catch {
            return null;
        }
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
                apiFetch(`${API_BASE_URL}/reports`, { headers: getHeaders() }),
                apiFetch(`${API_BASE_URL}/evidence-reports`, { headers: getHeaders() }),
            ]);

            await ensureOk(legacyResponse, 'Failed to load legacy reports.');
            await ensureOk(evidenceResponse, 'Failed to load citizen evidence reports.');

            const legacyReports = (await legacyResponse.json()).map(mapReportToFrontend);
            const evidenceReports = (await evidenceResponse.json()).map(mapCitizenReportToFrontend);

            return [...legacyReports, ...evidenceReports];
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to load reports from the backend.');
        }
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
            throw new Error(extractErrorMessage(errorData, 'Failed to update report status'));
            }
            const data = await response.json();
            return report.source === 'evidence-report'
                ? mapCitizenReportToFrontend(data)
                : mapReportToFrontend(data);
        } catch { return null; }
    },

    rerunEvidenceReportInference: async (reportId: string): Promise<Report> => {
        const response = await fetch(`${API_BASE_URL}/evidence-reports/${reportId}/rerun-inference`, {
            method: 'POST',
            headers: getHeaders(),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to re-run AI analysis'));
        }
        const data = await response.json();
        return mapCitizenReportToFrontend(data);
    },

    updateEvidenceReportPlate: async (reportId: string, correctedPlateNumber: string, notes?: string): Promise<Report> => {
        const response = await fetch(`${API_BASE_URL}/evidence-reports/${reportId}/plate`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify({
                corrected_plate_text: correctedPlateNumber,
                notes,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to save the corrected plate number.'));
        }
        const data = await response.json();
        return mapCitizenReportToFrontend(data);
    },

    // --- User & Reward Methods ---
    getProfile: async () => {
        const response = await apiFetch(`${API_BASE_URL}/users/me`, {
            headers: getHeaders()
        });
        await ensureOk(response, 'Failed to load your profile.');
        return response.json();
    },

    getMyReports: async (): Promise<Report[]> => {
        const response = await fetch(`${API_BASE_URL}/users/me/reports`, {
            headers: getHeaders()
        });
        if (response.status === 401) {
            auth.logout();
            if (typeof window !== 'undefined') window.location.href = '/login';
            throw new Error('Your session has expired. Please sign in again.');
        }
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
            throw new Error(extractErrorMessage(errorData, 'Failed to claim reward'));
        }
        return response.json();
    },

    seed: () => {
        // Seeding is now handled directly by the Python backend on startup.
    },

    // --- Admin Endpoints ---
    adminGetUsers: async () => {
        const response = await apiFetch(`${API_BASE_URL}/users`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load users.');
        return response.json();
    },

    adminCreateUser: async (user: any) => {
        const response = await apiFetch(`${API_BASE_URL}/users`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(user)
        });
        await ensureOk(response, 'Failed to create user.');
        return response.json();
    },

    adminGetAuditLogs: async () => {
        const response = await apiFetch(`${API_BASE_URL}/admin/audit-logs`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load audit logs.');
        return response.json();
    },

    adminGetViolationTypes: async () => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/violation-types`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load violation analytics.');
        return response.json();
    },

    adminGetDistrictAnalytics: async (): Promise<{ district: string; count: number }[]> => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/districts`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load district analytics.');
        return response.json();
    },

    adminGetStatusRatio: async () => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/status-ratio`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load status analytics.');
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
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/reports-trend`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load reports trend.');
        return response.json();
    },

    adminGetAiMetrics: async (): Promise<{ avg_helmet_confidence: number, avg_ocr_confidence: number, avg_inference_latency_seconds: number }> => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/ai-metrics`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load AI metrics.');
        return response.json();
    },

    adminGetAnprPerformance: async (): Promise<{
        total_reports_with_plate_detected: number;
        ocr_succeeded: number;
        ocr_failed: number;
        avg_plate_detection_confidence: number;
        avg_ocr_confidence: number;
        manual_plate_correction_count: number;
        anpr_failure_count: number;
    }> => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/anpr-performance`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load ANPR analytics.');
        return response.json();
    },

    adminGetOfficerMetrics: async (): Promise<{ officer_id: string, total_validations: number, tickets_issued: number, approval_rate_percent: number }[]> => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/officers`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load officer analytics.');
        return response.json();
    },

    adminGetHeatmapData: async (): Promise<{ lat: number, lng: number, weight: number }[]> => {
        const response = await apiFetch(`${API_BASE_URL}/admin/analytics/heatmap`, { headers: getHeaders() });
        await ensureOk(response, 'Failed to load heatmap data.');
        return response.json();
    },

    // --- Fine Rules Engine Methods ---
    getFineRules: async () => {
        const response = await apiFetch(`${API_BASE_URL}/fine-rules`, {
            headers: getHeaders(),
        });
        await ensureOk(response, 'Failed to load fine rules.');
        const data = await response.json();
        return data.map(mapFineRuleToFrontend);
    },

    getFineRuleByViolation: async (violationType: string) => {
        const response = await apiFetch(`${API_BASE_URL}/fine-rules/${normalizeViolationType(violationType)}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(await getResponseErrorMessage(response, 'Failed to load the fine rule.'));
        }
        const data = await response.json();
        return mapFineRuleToFrontend(data);
    },

    createFineRule: async (ruleData: { violationType: string; penalCode: string; fineAmount: number; currency: string; description?: string; active: boolean }) => {
        const payload = {
            violation_type: normalizeViolationType(ruleData.violationType),
            penal_code: ruleData.penalCode,
            fine_amount: ruleData.fineAmount,
            currency: ruleData.currency,
            description: ruleData.description,
            active: ruleData.active,
        };
        const response = await fetch(`${API_BASE_URL}/fine-rules`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to create fine rule'));
        }
        return mapFineRuleToFrontend(await response.json());
    },

    updateFineRule: async (ruleId: string, ruleData: { penalCode?: string; fineAmount?: number; currency?: string; description?: string; active?: boolean }) => {
        const payload = {
            penal_code: ruleData.penalCode,
            fine_amount: ruleData.fineAmount,
            currency: ruleData.currency,
            description: ruleData.description,
            active: ruleData.active,
        };
        const response = await fetch(`${API_BASE_URL}/fine-rules/${ruleId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to update fine rule'));
        }
        return mapFineRuleToFrontend(await response.json());
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
                offender_contact: options?.offenderContact,
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
                offender_contact: options?.offenderContact,
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
            throw new Error(extractErrorMessage(errorData, 'Failed to issue ticket'));
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
        const response = await apiFetch(`${API_BASE_URL}/tickets/${ticketId}`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            throw new Error(await getResponseErrorMessage(response, 'Failed to load the ticket.'));
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
            throw new Error(extractErrorMessage(errorData, 'Failed to update ticket status'));
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

    downloadTicketNoticePdf: async (ticketId: string, ticketNumber: string) => {
        const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/notice.pdf`, {
            headers: getHeaders(),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to download PDF notice'));
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notice_${ticketNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    // ---------------------------------------------------------------------------
    // Staff notifications (police / admin) — /api/notifications
    // ---------------------------------------------------------------------------

    getStaffNotifications: async (params: {
        unreadOnly?: boolean;
        limit?: number;
        offset?: number;
        notificationType?: string;
    } = {}): Promise<NotificationListResult> => {
        const query = new URLSearchParams();
        if (params.unreadOnly) query.set('unread_only', 'true');
        if (params.limit !== undefined) query.set('limit', String(params.limit));
        if (params.offset !== undefined) query.set('offset', String(params.offset));
        if (params.notificationType) query.set('notification_type', params.notificationType);
        const response = await fetch(`${API_BASE_URL}/notifications?${query}`, { headers: getHeaders() });
        if (response.status === 401) {
            auth.logout();
            if (typeof window !== 'undefined') window.location.href = '/login';
            throw new Error('Your session has expired. Please sign in again.');
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(extractErrorMessage(errorData, 'Failed to load notifications'));
        }
        const data = await response.json();
        return {
            items: data.items as AppNotification[],
            total: data.total,
            unread_count: data.unread_count,
        };
    },

    getStaffUnreadCount: async (): Promise<number> => {
        const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, { headers: getHeaders() });
        if (!response.ok) return 0;
        const data = await response.json();
        return data.count ?? 0;
    },

    markStaffNotificationRead: async (notificationId: string): Promise<AppNotification | null> => {
        const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
            method: 'PATCH',
            headers: getHeaders(),
        });
        if (!response.ok) return null;
        return response.json();
    },

    markAllStaffNotificationsRead: async (): Promise<void> => {
        await fetch(`${API_BASE_URL}/notifications/read-all`, { method: 'PATCH', headers: getHeaders() });
    },

    deleteStaffNotification: async (notificationId: string): Promise<void> => {
        await fetch(`${API_BASE_URL}/notifications/${notificationId}`, { method: 'DELETE', headers: getHeaders() });
    },
};
