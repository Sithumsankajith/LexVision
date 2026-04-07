import type { ReportStatus, ReportStatusSource } from '@lexvision/types';

export const getCitizenStatusLabel = (status: ReportStatus) => {
    switch (status) {
        case 'under-review':
            return 'Under Review';
        case 'verified':
            return 'Accepted';
        case 'rejected':
            return 'Rejected';
        case 'closed':
            return 'Closed';
        case 'forwarded':
            return 'Forwarded';
        default:
            return 'Submitted';
    }
};

export const getCitizenStatusStep = (status: ReportStatus) => {
    switch (status) {
        case 'submitted':
            return 1;
        case 'under-review':
            return 2;
        case 'verified':
        case 'rejected':
            return 3;
        case 'closed':
        case 'forwarded':
            return 4;
        default:
            return 1;
    }
};

export const getCitizenStatusSourceLabel = (source: ReportStatusSource) => {
    switch (source) {
        case 'admin':
            return 'Admin';
        case 'police':
            return 'Police';
        case 'citizen':
            return 'Citizen';
        case 'ml-worker':
            return 'AI Review';
        default:
            return 'System';
    }
};
