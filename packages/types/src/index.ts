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

// ---------------------------------------------------------------------------
// Ticket Lifecycle Types
// ---------------------------------------------------------------------------

/**
 * Enforcement ticket lifecycle statuses.
 *
 * Lifecycle:
 *   draft → issued → notified → paid → closed
 *                       ↓         ↓
 *                    overdue   appealed → cancelled → closed
 *                       ↓                    ↑
 *                    paid / cancelled ────────┘
 */
export type TicketStatus =
  | 'draft'
  | 'issued'
  | 'notified'
  | 'paid'
  | 'overdue'
  | 'appealed'
  | 'cancelled'
  | 'closed';

/** Full enforcement ticket representation. */
export interface TrafficTicket {
  id: string;
  ticketNumber: string;
  reportId?: string | null;
  evidenceReportId?: string;
  officerId: string;
  status: TicketStatus;
  fineRuleId?: string;
  fineRuleVersion?: number;
  penalCode: string;
  fineAmount: number;
  fineOverrideReason?: string;
  violationType?: string | null;
  vehiclePlate?: string | null;
  offenderName?: string | null;
  offenderContact?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  paymentReference?: string | null;
  appealReason?: string | null;
  appealedAt?: string | null;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory?: TicketStatusHistoryEntry[];
}

/** Single audit entry for a ticket status transition. */
export interface TicketStatusHistoryEntry {
  id: string;
  previousStatus?: TicketStatus;
  newStatus: TicketStatus;
  changeSource: string;
  notes?: string;
  details?: Record<string, any>;
  changedAt: string;
}

export interface FineRule {
  id: string;
  violationType: string;
  penalCode: string;
  fineAmount: number;
  currency: string;
  description?: string;
  severity?: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
