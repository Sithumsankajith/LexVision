export type ViolationType = 'helmet' | 'red-light' | 'white-line';

export type ReportStatus = 'submitted' | 'under-review' | 'verified' | 'rejected' | 'forwarded';

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
  citizen: Citizen;
  violationType: ViolationType;
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
    detectedPlate?: string | null;
    confidence?: number;
  };
}

export interface ViolationStats {
  totalReports: number;
  verifiedReports: number;
  violationsByType: Record<ViolationType, number>;
}
