export type ViolationType = 'helmet' | 'no-helmet' | 'red-light' | 'white-line' | string;
export type ConfidenceBand = 'high' | 'medium' | 'low';

export type ReportStatus = 'submitted' | 'under-review' | 'verified' | 'rejected' | 'closed' | 'forwarded';
export type ReportSource = 'legacy-report' | 'evidence-report';
export type ReportStatusSource = 'system' | 'citizen' | 'police' | 'admin' | 'ml-worker';

export interface Location {
  lat: number;
  lng: number;
  address: string;
  city: string;
}

export interface Evidence {
  id: string;
  type: 'image' | 'video';
  url: string; // Blob URL or placeholder
  thumbnail?: string;
  name: string;
  size: number;
  file?: File; // For upload simulation
}

export interface VehicleDetails {
  plate?: string;
  type?: string;
  notes?: string;
}

export interface Citizen {
  email?: string;
  phone?: string;
}

export interface Report {
  id: string;
  trackingId: string;
  source?: ReportSource;
  citizen: Citizen;
  violationType: ViolationType;
  claimedViolationType?: string | null;
  inferredViolationType?: string | null;
  finalViolationType?: string | null;
  datetime: string; // ISO string
  location: Location;
  evidence: Evidence[];
  vehicle: VehicleDetails;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  aiAnalysis?: {
    detectedViolationType?: string | null;
    claimedViolationType?: string | null;
    inferredViolationType?: string | null;
    finalViolationType?: string | null;
    detectedPlate?: string | null;
    confidence?: number;
    confidenceBand?: ConfidenceBand | null;
    modelVersion?: string | null;
    bbox?: Record<string, unknown> | null;
    ocrOutput?: {
      text?: string | null;
      rawText?: string | null;
      confidence?: number | null;
      validationStatus?: string | null;
    } | null;
    processedAt?: string | null;
  };
}

export interface ReportStatusHistoryEntry {
  id: string;
  previousStatus?: ReportStatus | null;
  newStatus: ReportStatus;
  notes?: string;
  changedAt: string;
  source: ReportStatusSource;
}

export interface CitizenReportDetail extends Report {
  statusHistory: ReportStatusHistoryEntry[];
}

export interface ViolationStats {
  totalReports: number;
  verifiedReports: number;
  violationsByType: Record<ViolationType, number>;
}
