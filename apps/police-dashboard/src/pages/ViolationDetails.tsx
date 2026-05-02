import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Car,
    CheckCircle,
    ClipboardCheck,
    Download,
    Image as ImageIcon,
    Loader2,
    MapPin,
    PlayCircle,
    RefreshCcw,
    XCircle,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { Button, Input } from '@lexvision/ui';
import { Badge, Panel } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { FineRule, Report, TrafficTicket } from '@lexvision/types';
import {
    formatConfidence,
    formatViolationLabel,
    getOfficerAISuggestion,
    getOfficerDecisionBadge,
    getOfficerDetectionLabel,
    getOfficerGuidance,
    getOfficerReviewPriority,
    getRelevantDetections,
} from '../utils/officerAi';

const getStatusBadgeVariant = (status: Report['status']) =>
    status === 'submitted' ? 'info' :
        status === 'under-review' ? 'warning' :
            status === 'rejected' ? 'error' :
                'success';

const getPriorityBadgeVariant = (priority: string) =>
    priority === 'High' ? 'success' :
        priority === 'Medium' ? 'info' :
            'warning';

export const ViolationDetails: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [officerNotes, setOfficerNotes] = useState('');
    const [showTicketForm, setShowTicketForm] = useState(false);
    const [fineRule, setFineRule] = useState<FineRule | null>(null);
    const [isOverride, setIsOverride] = useState(false);
    const [penalCode, setPenalCode] = useState('');
    const [fineAmount, setFineAmount] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [ticket, setTicket] = useState<TrafficTicket | null>(null);
    const [ticketLoading, setTicketLoading] = useState(false);
    const [ticketError, setTicketError] = useState('');
    const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
    const [rerunLoading, setRerunLoading] = useState(false);
    const [rerunError, setRerunError] = useState('');
    const [zoom, setZoom] = useState(1);

    const loadReportDetails = async (reportId: string) => {
        try {
            const data = await mockDb.getReportById(reportId);
            setReport(data);

            if (data && (data.status === 'verified' || data.status === 'closed')) {
                setTicketLoading(true);
                try {
                    const existingTicket = await mockDb.getTicketForReport(data.id, data.source);
                    setTicket(existingTicket);
                } catch (error) {
                    console.error('Failed to load ticket', error);
                } finally {
                    setTicketLoading(false);
                }
            } else {
                setTicket(null);
            }

            return data;
        } catch (error) {
            console.error('Failed to load case', error);
            return null;
        }
    };

    useEffect(() => {
        const fetchReport = async () => {
            if (id) {
                await loadReportDetails(id);
            }
            setLoading(false);
        };
        fetchReport();
    }, [id]);

    const openTicketForm = async (currentReport: Report) => {
        setShowTicketForm(true);
        if (currentReport.finalViolationType) {
            try {
                const rule = await mockDb.getFineRuleByViolation(currentReport.finalViolationType);
                if (rule) {
                    setFineRule(rule);
                    setPenalCode(rule.penalCode);
                    setFineAmount(rule.fineAmount.toString());
                }
            } catch (error) {
                console.error('Failed to load fine rule', error);
            }
        }
    };

    const applyStatusUpdate = async (currentReport: Report, status: Report['status']) => {
        const updated = await mockDb.updateReportStatus({ id: currentReport.id, source: currentReport.source }, status, officerNotes);
        if (!updated) {
            throw new Error('Failed to update status. The server may have rejected the transition.');
        }

        setReport(updated);
        if (status === 'verified' && updated.source !== 'evidence-report') {
            await openTicketForm(updated);
        } else if (status !== 'verified') {
            setShowTicketForm(false);
        }

        return updated;
    };

    const handleStatusUpdate = async (status: Report['status']) => {
        if (!report) {
            return;
        }

        setActionLoading(true);
        try {
            await applyStatusUpdate(report, status);
        } catch (error: any) {
            alert(error?.message || 'Status update failed');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApproveViolation = async () => {
        if (!report) {
            return;
        }

        const aiSummary = report.aiSummary;
        const aiBadge = getOfficerDecisionBadge(aiSummary);
        const confirmationParts = [
            'You are confirming this violation based on submitted evidence and AI assistance. AI does not issue fines automatically.',
        ];

        if (aiBadge.label === 'AI inconclusive' || aiBadge.label === 'Needs officer review') {
            confirmationParts.unshift('AI could not confirm this case. Please inspect the evidence carefully.');
        }

        if (!window.confirm(confirmationParts.join('\n\n'))) {
            return;
        }

        setActionLoading(true);
        try {
            let currentReport = report;
            if (currentReport.status === 'submitted') {
                currentReport = await applyStatusUpdate(currentReport, 'under-review');
            }
            await applyStatusUpdate(currentReport, 'verified');
        } catch (error: any) {
            alert(error?.message || 'Unable to approve this violation.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectReport = async () => {
        if (!report) {
            return;
        }

        setActionLoading(true);
        try {
            let currentReport = report;
            if (currentReport.status === 'submitted') {
                currentReport = await applyStatusUpdate(currentReport, 'under-review');
            }
            await applyStatusUpdate(currentReport, 'rejected');
        } catch (error: any) {
            alert(error?.message || 'Unable to reject this report.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleIssueTicket = async () => {
        if (!report) {
            return;
        }

        setActionLoading(true);
        setTicketError('');
        try {
            const newTicket = await mockDb.issueTicket(
                report.id,
                isOverride ? penalCode : null,
                isOverride ? parseFloat(fineAmount) : null,
                {
                    overrideReason: isOverride ? overrideReason : undefined,
                    evidenceReportId: report.source === 'evidence-report' ? report.id : undefined,
                    violationType: report.finalViolationType || undefined,
                    vehiclePlate: report.vehicle?.plate || report.aiAnalysis?.detectedPlate || undefined,
                },
            );
            setTicket(newTicket);
            setShowTicketForm(false);
        } catch (error: any) {
            setTicketError(error.message || 'Failed to issue ticket');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRerunInference = async () => {
        if (!report || report.source !== 'evidence-report') {
            return;
        }

        setRerunLoading(true);
        setRerunError('');
        try {
            const updated = await mockDb.rerunEvidenceReportInference(report.id);
            setReport(updated);
        } catch (error: any) {
            setRerunError(error.message || 'Failed to re-run AI analysis');
        } finally {
            setRerunLoading(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Case...</div>;
    }

    if (!report) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Case not found.</div>;
    }

    const mainEvidence = report.evidence[0];
    const aiSummary = report.aiSummary;
    const claimedViolation = report.claimedViolationType || report.violationType;
    const aiSuggestion = getOfficerAISuggestion(aiSummary);
    const reviewPriority = getOfficerReviewPriority(aiSummary);
    const officerGuidance = getOfficerGuidance(aiSummary, claimedViolation);
    const aiBadge = getOfficerDecisionBadge(aiSummary);
    const relevantDetections = getRelevantDetections(aiSummary?.detections || [], aiSummary?.violationFamily || claimedViolation);
    const overlayDetections = relevantDetections.filter((detection) =>
        detection.bbox?.x != null &&
        detection.bbox?.y != null &&
        detection.bbox?.width != null &&
        detection.bbox?.height != null &&
        imageNaturalSize.width > 0 &&
        imageNaturalSize.height > 0
    );

    const isEvidenceReport = report.source === 'evidence-report';
    const isSubmitted = report.status === 'submitted';
    const isUnderReview = report.status === 'under-review';
    const isVerified = report.status === 'verified';
    const isRejected = report.status === 'rejected';
    const isClosed = report.status === 'closed';
    const isResolved = isVerified || isRejected;
    const canRerunAiAnalysis = isEvidenceReport && !!aiSummary?.error && !isVerified && !isClosed;
    const showManualReviewWarning = aiSuggestion === 'AI could not confirm' || aiSuggestion === 'Manual review required' || aiSuggestion === 'AI failed';

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={16} /> Back
                </Button>
                <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Case #{report.trackingId}</h1>
                <Badge variant={getStatusBadgeVariant(report.status)}>
                    {report.status.replace(/-/g, ' ').toUpperCase()}
                </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div
                        style={{
                            background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
                            borderRadius: 'var(--radius-lg)',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            overflow: 'hidden',
                            minHeight: '560px',
                            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
                        }}
                    >
                        {mainEvidence?.type === 'image' && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 'var(--space-3)',
                                    right: 'var(--space-3)',
                                    zIndex: 10,
                                    display: 'flex',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    background: 'rgba(15, 23, 42, 0.72)',
                                    padding: '8px',
                                    borderRadius: '12px',
                                    backdropFilter: 'blur(6px)',
                                }}
                            >
                                <Button size="sm" variant="whiteOutline" leftIcon={<ZoomOut size={14} />} onClick={() => setZoom((currentZoom) => Math.max(0.5, currentZoom - 0.25))}>
                                    Zoom Out
                                </Button>
                                <Button size="sm" variant="whiteOutline" leftIcon={<ZoomIn size={14} />} onClick={() => setZoom((currentZoom) => Math.min(3, currentZoom + 0.25))}>
                                    Zoom In
                                </Button>
                                <Button size="sm" variant="whiteOutline" onClick={() => setZoom(1)}>
                                    Reset
                                </Button>
                            </div>
                        )}

                        <div style={{ padding: 'var(--space-4) var(--space-4) 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                            <div style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '1rem' }}>Evidence Viewer</div>
                            {mainEvidence?.type === 'image' && (
                                <Badge variant="info">{Math.round(zoom * 100)}% zoom</Badge>
                            )}
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 'var(--space-4)' }}>
                            {mainEvidence?.type === 'image' ? (
                                <div
                                    style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        transition: 'transform 0.2s ease-out',
                                        transform: `scale(${zoom})`,
                                        transformOrigin: 'center center',
                                    }}
                                >
                                    <img
                                        src={mainEvidence.url}
                                        alt="Evidence"
                                        onLoad={(event) => {
                                            setImageNaturalSize({
                                                width: event.currentTarget.naturalWidth,
                                                height: event.currentTarget.naturalHeight,
                                            });
                                        }}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '72vh',
                                            objectFit: 'contain',
                                            display: 'block',
                                            borderRadius: '10px',
                                        }}
                                    />
                                    {overlayDetections.map((detection, index) => {
                                        const bbox = detection.bbox!;
                                        const left = (((bbox.x || 0) - ((bbox.width || 0) / 2)) / imageNaturalSize.width) * 100;
                                        const top = (((bbox.y || 0) - ((bbox.height || 0) / 2)) / imageNaturalSize.height) * 100;
                                        const width = ((bbox.width || 0) / imageNaturalSize.width) * 100;
                                        const height = ((bbox.height || 0) / imageNaturalSize.height) * 100;
                                        const label = getOfficerDetectionLabel(detection, aiSummary?.violationFamily || claimedViolation);

                                        return (
                                            <div
                                                key={`${detection.class}-${index}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${left}%`,
                                                    top: `${top}%`,
                                                    width: `${width}%`,
                                                    height: `${height}%`,
                                                    border: '2px solid #38bdf8',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
                                                    pointerEvents: 'none',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '-28px',
                                                        left: '-2px',
                                                        padding: '4px 8px',
                                                        borderRadius: '999px',
                                                        backgroundColor: '#38bdf8',
                                                        color: '#fff',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 800,
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: '0 6px 14px rgba(15, 23, 42, 0.32)',
                                                    }}
                                                >
                                                    {label}
                                                    {detection.confidence > 0.5 ? ` ${formatConfidence(detection.confidence, '')}` : ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                                    {mainEvidence?.type === 'video' ? <PlayCircle size={64} /> : <ImageIcon size={64} />}
                                    <span>{mainEvidence ? 'Playback Evidence Clip' : 'No Evidence Available'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <Panel
                        className="metadata-card"
                        style={{
                            padding: 'var(--space-5)',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 'var(--space-4)',
                        }}
                        noPadding
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '700' }}>
                                <Car size={14} style={{ verticalAlign: 'text-bottom' }} /> License Plate
                            </span>
                            <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>
                                {report.aiAnalysis?.detectedPlate || report.vehicle?.plate || 'Pending'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '700' }}>
                                <Calendar size={14} style={{ verticalAlign: 'text-bottom' }} /> Submitted
                            </span>
                            <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>
                                {new Date(report.createdAt).toLocaleString()}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '700' }}>
                                <MapPin size={14} style={{ verticalAlign: 'text-bottom' }} /> Location
                            </span>
                            <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>
                                {report.location.address || report.location.city}
                            </span>
                        </div>
                    </Panel>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <Panel
                        title="AI Evidence Review"
                        style={{
                            border: '1px solid rgba(15, 23, 42, 0.08)',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.08)',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 'var(--space-3)',
                                    flexWrap: 'wrap',
                                    padding: 'var(--space-4)',
                                    borderRadius: 'var(--radius-lg)',
                                    background: 'linear-gradient(135deg, rgba(248, 250, 252, 1) 0%, rgba(241, 245, 249, 0.9) 100%)',
                                    border: '1px solid rgba(148, 163, 184, 0.18)',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <Badge variant={aiBadge.variant}>{aiBadge.label}</Badge>
                                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--color-text)', lineHeight: 1.3 }}>
                                        {aiSuggestion}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
                                        Review Priority
                                    </div>
                                    <Badge variant={getPriorityBadgeVariant(reviewPriority)}>{reviewPriority}</Badge>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.04em', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                                        Citizen Reported
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--color-text)' }}>
                                        {formatViolationLabel(claimedViolation)}
                                    </div>
                                </div>

                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.04em', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                                        AI Suggestion
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--color-text)' }}>
                                        {aiSuggestion}
                                    </div>
                                </div>

                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '800', letterSpacing: '0.04em', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                                        Officer Guidance
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-text)', lineHeight: 1.5 }}>
                                        {officerGuidance}
                                    </div>
                                </div>
                            </div>

                            {canRerunAiAnalysis && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <Button size="sm" variant="outline" onClick={handleRerunInference} disabled={rerunLoading}>
                                        {rerunLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                                        {' '}Re-run AI Analysis
                                    </Button>
                                    {rerunError && (
                                        <span style={{ color: '#b91c1c', fontSize: '0.82rem' }}>{rerunError}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </Panel>

                    <Panel title="Officer Actions" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-border)', marginTop: '6px', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: '600' }}>Citizen Report Received</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{new Date(report.createdAt).toLocaleString()}</div>
                                    {report.vehicle?.notes && (
                                        <div style={{ fontSize: '0.75rem', fontStyle: 'italic', marginTop: '4px', color: 'var(--color-text-secondary)' }}>
                                            "{report.vehicle.notes}"
                                        </div>
                                    )}
                                </div>
                            </div>

                            {showManualReviewWarning && !isClosed && (
                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.26)', color: '#92400e', lineHeight: 1.5, fontSize: '0.9rem' }}>
                                    AI could not confirm this case. Please inspect the evidence carefully.
                                </div>
                            )}

                            {ticketLoading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', padding: 'var(--space-2) 0' }}>
                                    <Loader2 size={16} className="spin" /> Checking ticket status...
                                </div>
                            )}

                            {ticket && (
                                <div style={{ padding: 'var(--space-4)', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <ClipboardCheck size={24} color="#10b981" style={{ alignSelf: 'flex-start', marginTop: '2px' }} />
                                    <div style={{ width: '100%' }}>
                                        <div style={{ fontWeight: '800', color: '#10b981', fontSize: '1rem', marginBottom: '8px' }}>Fine Issued</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text)' }}>
                                            <div><strong>Ticket Number:</strong> {ticket.ticketNumber}</div>
                                            <div><strong>Status:</strong> <Badge variant="neutral">{ticket.status.toUpperCase()}</Badge></div>
                                            <div><strong>Penal Code:</strong> {ticket.penalCode}</div>
                                            <div><strong>Fine Amount:</strong> Rs. {ticket.fineAmount}</div>
                                            <div><strong>Due Date:</strong> {ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : 'Pending'}</div>
                                            <div><strong>Payment Status:</strong> {ticket.paidAt ? 'Paid' : 'Unpaid'}</div>
                                        </div>
                                        <div style={{ marginTop: 'var(--space-3)' }}>
                                            <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={() => {
                                                mockDb.downloadTicketNoticePdf(ticket.id, ticket.ticketNumber).catch((error) => {
                                                    alert(error.message || 'Failed to download PDF notice');
                                                });
                                            }}>
                                                Download Notice (PDF)
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!isClosed && (
                                <>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '-6px' }}>
                                        Officer Notes
                                    </label>
                                    <textarea
                                        value={officerNotes}
                                        onChange={(event) => setOfficerNotes(event.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: 'var(--space-3)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            backgroundColor: 'var(--color-bg-secondary)',
                                            minHeight: '96px',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            color: 'var(--color-text)',
                                        }}
                                        placeholder="Add your review notes before making a decision..."
                                    />
                                </>
                            )}

                            {showTicketForm && !ticket && !isEvidenceReport && (
                                <div style={{ padding: 'var(--space-4)', backgroundColor: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                                        <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--color-text)' }}>
                                            <ClipboardCheck size={16} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                            Issue Traffic Ticket
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={isOverride} onChange={(event) => setIsOverride(event.target.checked)} />
                                            Manual Override
                                        </label>
                                    </div>

                                    {!isOverride && fineRule && (
                                        <div style={{ padding: '10px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                            <div><strong>Default Rule Applied:</strong> {fineRule.description}</div>
                                            <div><strong>Penal Code:</strong> {fineRule.penalCode}</div>
                                            <div><strong>Fine Amount:</strong> {fineRule.currency} {fineRule.fineAmount}</div>
                                        </div>
                                    )}

                                    {!fineRule && !isOverride && (
                                        <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                                            No default fine rule found for this violation. You must override.
                                        </div>
                                    )}

                                    {isOverride && (
                                        <>
                                            <Input label="Penal Code" value={penalCode} onChange={(event) => setPenalCode(event.target.value)} fullWidth />
                                            <Input label="Fine Amount (Rs.)" type="number" value={fineAmount} onChange={(event) => setFineAmount(event.target.value)} fullWidth />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <label style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                                                    Override Reason <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <textarea
                                                    value={overrideReason}
                                                    onChange={(event) => setOverrideReason(event.target.value)}
                                                    placeholder="Required justification for changing the default rule..."
                                                    style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px', resize: 'vertical', minHeight: '60px', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
                                                />
                                            </div>
                                        </>
                                    )}

                                    {ticketError && (
                                        <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '4px 0' }}>{ticketError}</div>
                                    )}

                                    <Button
                                        variant="primary"
                                        fullWidth
                                        leftIcon={actionLoading ? <Loader2 size={16} className="spin" /> : <ClipboardCheck size={16} />}
                                        onClick={handleIssueTicket}
                                        disabled={
                                            actionLoading ||
                                            (!isOverride && !fineRule) ||
                                            (isOverride && (!penalCode || !fineAmount || !overrideReason.trim()))
                                        }
                                    >
                                        {actionLoading ? 'Issuing...' : 'Confirm & Issue Ticket'}
                                    </Button>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                {!isClosed && !isVerified && (
                                    <>
                                        <Button variant="primary" fullWidth leftIcon={actionLoading ? <Loader2 size={18} className="spin" /> : <CheckCircle size={18} />} onClick={handleApproveViolation} disabled={actionLoading}>
                                            {actionLoading ? 'Processing...' : 'Approve Violation'}
                                        </Button>
                                        <Button variant="outline" fullWidth leftIcon={<XCircle size={18} />} style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={handleRejectReport} disabled={actionLoading}>
                                            Reject Report
                                        </Button>
                                        <Button variant="outline" fullWidth leftIcon={actionLoading ? <Loader2 size={18} className="spin" /> : <AlertTriangle size={18} />} onClick={() => handleStatusUpdate('under-review')} disabled={actionLoading || isUnderReview}>
                                            {isUnderReview ? 'Further Review Requested' : isSubmitted ? 'Request Further Review' : 'Re-open for Further Review'}
                                        </Button>
                                    </>
                                )}

                                {isVerified && !showTicketForm && !ticket && (
                                    isEvidenceReport ? (
                                        <Button variant="outline" fullWidth onClick={() => handleStatusUpdate('closed')} disabled={actionLoading}>
                                            Close Case
                                        </Button>
                                    ) : (
                                        <Button variant="primary" fullWidth leftIcon={<ClipboardCheck size={18} />} onClick={() => openTicketForm(report)}>
                                            Issue Traffic Ticket
                                        </Button>
                                    )
                                )}

                                {isRejected && (
                                    <Button variant="outline" fullWidth leftIcon={actionLoading ? <Loader2 size={18} className="spin" /> : <AlertTriangle size={18} />} onClick={() => handleStatusUpdate('under-review')} disabled={actionLoading}>
                                        Re-open for Further Review
                                    </Button>
                                )}

                                {isEvidenceReport && isRejected && !ticket && (
                                    <Button variant="outline" fullWidth onClick={() => handleStatusUpdate('closed')} disabled={actionLoading}>
                                        Close Case
                                    </Button>
                                )}

                                {(isResolved || isClosed) && (
                                    <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/queue')}>
                                        Return to Queue
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
};
