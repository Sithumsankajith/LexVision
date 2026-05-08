export type ViolationType = 'helmet' | 'red_light' | 'white_line' | 'no-helmet' | 'red-light' | 'white-line' | string;
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

export interface AIDetectionBBox {
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  x1?: number | null;
  y1?: number | null;
  x2?: number | null;
  y2?: number | null;
}

export interface AIDetection {
  class: string;
  normalizedClass?: string | null;
  confidence: number;
  confidenceLevel?: ConfidenceBand | null;
  bbox?: AIDetectionBBox | null;
  bboxXyxy?: AIDetectionBBox | null;
}

export interface AISummary {
  violationFamily?: string | null;
  provider?: string | null;
  modelId?: string | null;
  claimedViolationType?: string | null;
  inferredViolationType?: string | null;
  finalViolationType?: string | null;
  hasViolation: boolean;
  hasHelmetViolation: boolean;
  confidence: number;
  confidenceLevel?: ConfidenceBand | 'none' | null;
  manualReviewRequired: boolean;
  reviewReason?: string | null;
  detectedClasses: string[];
  detections: AIDetection[];
  error?: string | null;
  status?: string | null;
  processedAt?: string | null;
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
  aiSummary?: AISummary | null;
  aiAnalysis?: {
    detectedViolationType?: string | null;
    claimedViolationType?: string | null;
    inferredViolationType?: string | null;
    finalViolationType?: string | null;
    detectedPlate?: string | null;
    confidence?: number;
    confidenceBand?: ConfidenceBand | 'none' | null;
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

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export type NotificationRole = 'CITIZEN' | 'POLICE' | 'ADMIN';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type NotificationType =
  | 'report_submitted'
  | 'ai_analysis_completed'
  | 'report_under_review'
  | 'report_validated'
  | 'report_rejected'
  | 'ticket_issued'
  | 'new_report_submitted'
  | 'high_priority_report'
  | 'ticket_action_required'
  | 'ai_inference_failed'
  | 'system_warning'
  | 'worker_failure'
  | string;

export interface AppNotification {
  id: string;
  recipient_role: NotificationRole;
  title: string;
  message: string;
  notification_type: NotificationType;
  related_entity_type?: 'report' | 'evidence_report' | 'ticket' | 'system' | null;
  related_entity_id?: string | null;
  priority: NotificationPriority;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  extra_data?: Record<string, any> | null;
}

export interface NotificationListResult {
  items: AppNotification[];
  total: number;
  unread_count: number;
}

// --- Rewards & Profile Types ---
export interface Reward {
  id: string;
  title: string;
  description: string;
  points_cost: number;
  image_url?: string;
}

export interface UserReward {
  id: string;
  reward: Reward;
  claimed_at: string;
}

export interface UserProfile {
  user: {
    id: string;
    email: string;
    reward_points: number;
    role: string;
  };
  reports_count: number;
  validated_reports_count: number;
  claimed_rewards: UserReward[];
}
