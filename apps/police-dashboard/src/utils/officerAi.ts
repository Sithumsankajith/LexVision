import type { AIDetection, AISummary } from '@lexvision/types';

export type OfficerAISuggestion =
    | 'Possible violation detected'
    | 'AI could not confirm'
    | 'Manual review required'
    | 'AI failed';

export type OfficerReviewPriority = 'High' | 'Medium' | 'Manual review';

const normalizeViolationType = (value?: string | null) =>
    (value || '')
        .toLowerCase()
        .trim()
        .replace(/-/g, '_');

const normalizeDetectionClass = (value?: string | null) =>
    (value || '')
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, '_');

export const formatViolationLabel = (value?: string | null, emptyLabel = 'Pending police validation') => {
    const normalized = normalizeViolationType(value);
    if (!normalized) {
        return emptyLabel;
    }
    if (normalized === 'red_light') {
        return 'red light';
    }
    if (normalized === 'white_line') {
        return 'white line';
    }
    if (normalized === 'no_helmet') {
        return 'no helmet';
    }
    return normalized.replace(/_/g, ' ');
};

export const formatConfidence = (value?: number | null, emptyLabel = 'Not available') =>
    typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : emptyLabel;

export const getOfficerAISuggestion = (aiSummary?: AISummary | null): OfficerAISuggestion => {
    if (!aiSummary?.processedAt) {
        return 'AI could not confirm';
    }
    if (aiSummary.error) {
        return 'AI failed';
    }
    if (aiSummary.hasViolation) {
        return 'Possible violation detected';
    }
    if (aiSummary.manualReviewRequired || aiSummary.confidenceLevel === 'low') {
        return 'Manual review required';
    }
    return 'AI could not confirm';
};

export const getOfficerReviewPriority = (aiSummary?: AISummary | null): OfficerReviewPriority => {
    if (!aiSummary?.processedAt || aiSummary.error || aiSummary.manualReviewRequired || aiSummary.confidenceLevel === 'low') {
        return 'Manual review';
    }
    if (aiSummary.hasViolation && aiSummary.confidenceLevel === 'high') {
        return 'High';
    }
    return 'Medium';
};

export const getRelevantDetections = (detections: AIDetection[] = [], violationFamily?: string | null) => {
    const family = normalizeViolationType(violationFamily);
    return detections.filter((detection) => {
        const normalizedClass = normalizeDetectionClass(detection.normalizedClass || detection.class);
        if (!normalizedClass) {
            return false;
        }
        if (family === 'helmet') {
            return normalizedClass.includes('helmet');
        }
        if (family === 'red_light') {
            return normalizedClass.includes('red_light') || normalizedClass.includes('traffic_light') || normalizedClass.includes('signal');
        }
        if (family === 'white_line') {
            return normalizedClass.includes('white_line') || normalizedClass.includes('lane') || normalizedClass.includes('road_line') || normalizedClass.includes('cross');
        }
        return false;
    });
};

export const getOfficerGuidance = (aiSummary: AISummary | null | undefined, claimedViolation: string | null | undefined) => {
    const violationType = normalizeViolationType(aiSummary?.violationFamily || claimedViolation);
    const baseGuidance = violationType === 'red_light'
        ? 'Check if vehicle crossed during red signal'
        : violationType === 'white_line'
            ? 'Check if vehicle crossed white line illegally'
            : 'Check if rider is wearing helmet';

    if (!aiSummary?.processedAt || aiSummary.error || aiSummary.manualReviewRequired || aiSummary.confidenceLevel === 'low') {
        return `AI could not confirm. ${baseGuidance}`;
    }

    return baseGuidance;
};

export const getQueueAISuggestion = (aiSummary?: AISummary | null) => {
    if (!aiSummary?.processedAt) {
        return 'Pending';
    }
    if (aiSummary.error) {
        return 'Failed';
    }
    if (aiSummary.hasViolation) {
        return 'Supports violation';
    }
    return 'Inconclusive';
};

export const getOfficerDecisionBadge = (aiSummary?: AISummary | null) => {
    if (!aiSummary?.processedAt) {
        return { label: 'AI inconclusive', variant: 'neutral' as const };
    }
    if (aiSummary.error) {
        return { label: 'AI failed', variant: 'error' as const };
    }
    if (aiSummary.hasViolation) {
        return { label: 'AI supports violation', variant: 'success' as const };
    }
    if (aiSummary.manualReviewRequired || aiSummary.confidenceLevel === 'low') {
        return { label: 'Needs officer review', variant: 'warning' as const };
    }
    return { label: 'AI inconclusive', variant: 'neutral' as const };
};

export const getOfficerDetectionLabel = (detection: AIDetection, violationFamily?: string | null) => {
    const family = normalizeViolationType(violationFamily);
    const normalizedClass = normalizeDetectionClass(detection.normalizedClass || detection.class);

    if (family === 'helmet') {
        if (normalizedClass.includes('no_helmet') || normalizedClass.includes('without_helmet') || normalizedClass.includes('wrong_helmet')) {
            return 'No helmet';
        }
        return 'Helmet';
    }
    if (family === 'red_light') {
        return normalizedClass.includes('traffic_light') ? 'Traffic light' : 'Red light';
    }
    if (family === 'white_line') {
        return normalizedClass.includes('cross') ? 'White line crossing' : 'White line';
    }
    return normalizedClass.replace(/_/g, ' ');
};
