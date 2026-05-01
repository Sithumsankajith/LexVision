import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    MapPin,
    Calendar,
    Car,
    AlertTriangle,
    CheckCircle,
    XCircle,
    PlayCircle,
    BrainCircuit,
    RefreshCcw,
    Image as ImageIcon,
    ClipboardCheck,
    Loader2,
    Download,
    ZoomIn,
    ZoomOut,
    Maximize,
    Minimize,
    FileText
} from 'lucide-react';
import { Button, Input } from '@lexvision/ui';
import { Panel, Badge, DataTable } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { AISummary, Report, FineRule, TrafficTicket } from '@lexvision/types';

const formatViolation = (value?: string | null, emptyLabel = 'Pending police validation') => value ? value.replace(/-/g, ' ') : emptyLabel;
const formatClassLabel = (value?: string | null, emptyLabel = 'N/A') => value ? value.replace(/[_-]/g, ' ') : emptyLabel;
const formatConfidence = (value?: number | null) => typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : 'N/A';

const getAiSummaryState = (aiSummary?: AISummary | null) => {
    if (!aiSummary) {
        return {
            label: 'AI summary unavailable',
            helper: 'No normalized AI result is attached to this report yet.',
            accent: '#64748b',
            surface: 'rgba(100, 116, 139, 0.08)',
            border: 'rgba(100, 116, 139, 0.22)',
            badgeVariant: 'neutral' as const,
        };
    }

    if (aiSummary.error) {
        return {
            label: 'Inference failed',
            helper: aiSummary.error,
            accent: '#6b7280',
            surface: 'rgba(107, 114, 128, 0.08)',
            border: 'rgba(107, 114, 128, 0.22)',
            badgeVariant: 'error' as const,
        };
    }

    if (aiSummary.confidenceLevel === 'low') {
        return {
            label: 'Low confidence result',
            helper: aiSummary.hasHelmetViolation
                ? 'The model found a possible no-helmet signal, but confidence is too low to rely on without careful officer review.'
                : 'The model completed, but the result confidence is too low to support a clear AI conclusion.',
            accent: '#6b7280',
            surface: 'rgba(107, 114, 128, 0.08)',
            border: 'rgba(239, 68, 68, 0.22)',
            badgeVariant: 'error' as const,
        };
    }

    if (aiSummary.manualReviewRequired) {
        return {
            label: 'Manual review needed',
            helper: aiSummary.status === 'low_confidence_violation'
                ? 'A no-helmet candidate was found below the acceptance threshold.'
                : 'The AI result was not strong enough to infer a violation automatically.',
            accent: '#f59e0b',
            surface: 'rgba(245, 158, 11, 0.10)',
            border: 'rgba(245, 158, 11, 0.28)',
            badgeVariant: 'warning' as const,
        };
    }

    if (aiSummary.hasHelmetViolation) {
        return {
            label: 'Helmet violation detected',
            helper: 'The model found a no-helmet class above the configured threshold.',
            accent: '#2563eb',
            surface: 'rgba(37, 99, 235, 0.08)',
            border: 'rgba(16, 185, 129, 0.28)',
            badgeVariant: 'success' as const,
        };
    }

    return {
        label: 'No helmet violation detected',
        helper: 'The model completed successfully but did not confirm a no-helmet class.',
        accent: '#0f766e',
        surface: 'rgba(14, 165, 233, 0.08)',
        border: 'rgba(14, 165, 233, 0.24)',
        badgeVariant: 'info' as const,
    };
};

export const ViolationDetails: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [officerNotes, setOfficerNotes] = useState('');

    // Ticket issuance state
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
    const [isFullImageOpen, setIsFullImageOpen] = useState(false);

    const loadReportDetails = async (reportId: string) => {
        try {
            const data = await mockDb.getReportById(reportId);
            setReport(data);

            if (data && (data.status === 'verified' || data.status === 'closed')) {
                setTicketLoading(true);
                try {
                    const existingTicket = await mockDb.getTicketForReport(data.id, data.source);
                    setTicket(existingTicket);
                } catch (err) {
                    console.error("Failed to load ticket", err);
                } finally {
                    setTicketLoading(false);
                }
            } else {
                setTicket(null);
            }
            return data;
        } catch (e) {
            console.error("Failed to load case", e);
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

    const handleStatusUpdate = async (status: Report['status']) => {
        if (!report) return;
        setActionLoading(true);
        try {
            const updated = await mockDb.updateReportStatus({ id: report.id, source: report.source }, status, officerNotes);
            if (updated) {
                setReport(updated);
                if (status === 'verified' && updated.source !== 'evidence-report') {
                    openTicketForm(updated);
                } else if (status !== 'verified') {
                    setShowTicketForm(false);
                }
            } else {
                alert('Failed to update status. The server may have rejected the transition.');
            }
        } catch (e: any) {
            alert(e.message || 'Status update failed');
        } finally {
            setActionLoading(false);
        }
    };

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
            } catch (err) {
                console.error("Failed to load fine rule", err);
            }
        }
    };

    const handleIssueTicket = async () => {
        if (!report) return;
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
                }
            );
            setTicket(newTicket);
            setShowTicketForm(false);
        } catch (e: any) {
            setTicketError(e.message || 'Failed to issue ticket');
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
        } catch (e: any) {
            setRerunError(e.message || 'Failed to re-run AI analysis');
        } finally {
            setRerunLoading(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Case...</div>;
    if (!report) return <div style={{ padding: '2rem', textAlign: 'center' }}>Case not found.</div>;

    const mainEvidence = report.evidence[0];
    const aiSummary = report.aiSummary;
    const aiState = getAiSummaryState(aiSummary);
    const aiDetections = aiSummary?.detections || [];
    const overlayDetections = aiDetections.filter((detection) =>
        detection.bbox?.x != null &&
        detection.bbox?.y != null &&
        detection.bbox?.width != null &&
        detection.bbox?.height != null &&
        imageNaturalSize.width > 0 &&
        imageNaturalSize.height > 0
    );

    // Determine available actions based on current status
    const isEvidenceReport = report.source === 'evidence-report';
    const isSubmitted = report.status === 'submitted';
    const isUnderReview = report.status === 'under-review';
    const isVerified = report.status === 'verified';
    const isRejected = report.status === 'rejected';
    const isClosed = report.status === 'closed';
    const isResolved = isVerified || isRejected;
    const canRerunAiAnalysis = isEvidenceReport && !!aiSummary?.error && !isVerified && !isClosed;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Header / Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={16} /> Back
                </Button>
                <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Case #{report.trackingId}</h1>
                <Badge variant={
                    report.status === 'submitted' ? 'info' :
                        report.status === 'under-review' ? 'warning' :
                            report.status === 'rejected' ? 'error' :
                                report.status === 'closed' ? 'success' :
                                'success'
                }>
                    {report.status.replace(/-/g, ' ').toUpperCase()}
                </Badge>
                <div style={{ marginLeft: 'auto' }}>
                    {aiSummary ? (
                        <Badge variant="warning">
                            <BrainCircuit size={14} style={{ marginRight: '4px' }} /> AI ANALYZED
                        </Badge>
                    ) : (
                        <Badge variant="info">
                            <FileText size={14} style={{ marginRight: '4px' }} /> CITIZEN REPORT
                        </Badge>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', minHeight: 'calc(100vh - 140px)' }}>
                {/* Left Column: Evidence */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
                    {/* Viewer */}
                    <div style={{
                        flex: 1,
                        backgroundColor: '#0f172a',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: '400px'
                    }}>
                        {/* Toolbar */}
                        {mainEvidence?.type === 'image' && (
                            <div style={{
                                position: 'absolute',
                                top: 'var(--space-3)',
                                right: 'var(--space-3)',
                                zIndex: 10,
                                display: 'flex',
                                gap: '8px',
                                background: 'rgba(15, 23, 42, 0.7)',
                                padding: '6px',
                                borderRadius: '8px',
                                backdropFilter: 'blur(4px)'
                            }}>
                                <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} style={{ color: '#fff', padding: '4px' }}>
                                    <ZoomOut size={16} />
                                </Button>
                                <div style={{ display: 'flex', alignItems: 'center', color: '#fff', fontSize: '0.8rem', minWidth: '40px', justifyContent: 'center', fontWeight: 'bold' }}>
                                    {Math.round(zoom * 100)}%
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(3, z + 0.25))} style={{ color: '#fff', padding: '4px' }}>
                                    <ZoomIn size={16} />
                                </Button>
                                <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
                                <Button size="sm" variant="ghost" onClick={() => { setZoom(1); setIsFullImageOpen(false); }} style={{ color: '#fff', padding: '4px' }} title="Reset Zoom">
                                    <Minimize size={16} />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setIsFullImageOpen(prev => !prev)} style={{ color: '#fff', padding: '4px' }} title={isFullImageOpen ? "Close Full Image" : "Open Full Image"}>
                                    {isFullImageOpen ? <Minimize size={16} /> : <Maximize size={16} />}
                                </Button>
                            </div>
                        )}

                        <div style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'auto',
                            padding: 'var(--space-4)'
                        }}>
                            {mainEvidence?.type === 'image' ? (
                                <div style={{ 
                                    position: 'relative', 
                                    display: 'inline-block',
                                    transition: 'transform 0.2s ease-out',
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'center center'
                                }}>
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
                                            maxWidth: isFullImageOpen ? 'none' : '100%', 
                                            maxHeight: isFullImageOpen ? 'none' : '60vh',
                                            objectFit: 'contain', 
                                            display: 'block',
                                            borderRadius: '4px'
                                        }}
                                    />
                                    {overlayDetections.map((detection, index) => {
                                        const bbox = detection.bbox!;
                                        const left = (((bbox.x || 0) - ((bbox.width || 0) / 2)) / imageNaturalSize.width) * 100;
                                        const top = (((bbox.y || 0) - ((bbox.height || 0) / 2)) / imageNaturalSize.height) * 100;
                                        const width = ((bbox.width || 0) / imageNaturalSize.width) * 100;
                                        const height = ((bbox.height || 0) / imageNaturalSize.height) * 100;
                                        return (
                                            <div
                                                key={`${detection.class}-${index}`}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${left}%`,
                                                    top: `${top}%`,
                                                    width: `${width}%`,
                                                    height: `${height}%`,
                                                    border: `2px solid ${detection.normalizedClass === 'no-helmet' ? '#ef4444' : '#38bdf8'}`,
                                                    borderRadius: '4px',
                                                    boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
                                                    pointerEvents: 'none',
                                                }}
                                            >
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '-24px',
                                                    left: '-2px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: detection.normalizedClass === 'no-helmet' ? '#ef4444' : '#38bdf8',
                                                    color: '#fff',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    whiteSpace: 'nowrap',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                }}>
                                                    {formatClassLabel(detection.normalizedClass || detection.class)} {formatConfidence(detection.confidence)}
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

                    {/* Metadata Strip */}
                    <Panel className="metadata-card" style={{ padding: 'var(--space-5)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }} noPadding>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><Car size={14} style={{ verticalAlign: 'text-bottom' }} /> License Plate</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{report.aiAnalysis?.detectedPlate || report.vehicle?.plate || 'Unknown'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><AlertTriangle size={14} style={{ verticalAlign: 'text-bottom' }} /> Violation</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>Final: {formatViolation(report.finalViolationType)}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Claimed: {formatViolation(report.claimedViolationType || report.violationType)}</span>
                            <span style={{ fontSize: '0.75rem', color: report.inferredViolationType ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                                AI inferred: {formatViolation(aiSummary?.inferredViolationType || report.inferredViolationType, 'Not inferred')}
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><Calendar size={14} style={{ verticalAlign: 'text-bottom' }} /> Time</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{new Date(report.datetime).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><MapPin size={14} style={{ verticalAlign: 'text-bottom' }} /> Location</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{report.location.address || report.location.city}</span>
                        </div>
                    </Panel>
                </div>

                {/* Right Column: Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
                    <Panel
                        title="AI Detection Result"
                        style={{
                            flexShrink: 0,
                            border: `1px solid ${aiState.border}`,
                            background: aiState.surface,
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div style={{
                                padding: 'var(--space-4)',
                                borderRadius: 'var(--radius-lg)',
                                background: 'rgba(255, 255, 255, 0.55)',
                                border: `1px solid ${aiState.border}`,
                                display: 'grid',
                                gridTemplateColumns: '1.4fr 1fr',
                                gap: 'var(--space-4)',
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '14px',
                                            height: '14px',
                                            borderRadius: '50%',
                                            backgroundColor: aiState.accent,
                                            boxShadow: `0 0 0 6px ${aiState.surface}`,
                                        }} />
                                        <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                            AI Result: {aiState.label}
                                        </div>
                                        <Badge variant={aiState.badgeVariant}>{(aiSummary?.confidenceLevel || 'n/a').toUpperCase()}</Badge>
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                                        {aiState.helper}
                                    </div>
                                    {!aiSummary && (
                                        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                                            Safe fallback: no AI summary was returned, so officer review must rely on the original evidence.
                                        </div>
                                    )}
                                    {canRerunAiAnalysis && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleRerunInference}
                                                disabled={rerunLoading}
                                            >
                                                {rerunLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                                                {' '}Re-run AI Analysis
                                            </Button>
                                            {rerunError && (
                                                <span style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{rerunError}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                                    <div>
                                        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700 }}>Confidence</div>
                                        <div style={{ fontWeight: 700 }}>{formatConfidence(aiSummary?.confidence)}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700 }}>Review Needed</div>
                                        <div style={{ fontWeight: 700 }}>{aiSummary ? (aiSummary.manualReviewRequired ? 'Yes' : 'No') : 'Yes'}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700 }}>Provider</div>
                                        <div style={{ fontWeight: 700 }}>{aiSummary?.provider || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700 }}>Model ID</div>
                                        <div style={{ fontWeight: 700, wordBreak: 'break-word' }}>{aiSummary?.modelId || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.55)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700, marginBottom: '8px' }}>Violation Comparison</div>
                                    <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                                        <div><strong>Claimed:</strong> {formatViolation(aiSummary?.claimedViolationType || report.claimedViolationType || report.violationType)}</div>
                                        <div><strong>AI inferred:</strong> {formatViolation(aiSummary?.inferredViolationType || report.inferredViolationType, 'Not inferred')}</div>
                                        <div><strong>Final officer-approved:</strong> {formatViolation(report.finalViolationType)}</div>
                                    </div>
                                </div>
                                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.55)', border: '1px solid var(--color-border)' }}>
                                    <div style={{ color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 700, marginBottom: '8px' }}>Detected Classes</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {(aiSummary?.detectedClasses?.length ? aiSummary.detectedClasses : ['No classes returned']).map((item) => (
                                            <Badge key={item} variant={item === 'No classes returned' ? 'neutral' : 'info'}>
                                                {formatClassLabel(item)}
                                            </Badge>
                                        ))}
                                    </div>
                                    {aiSummary?.error && (
                                        <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '0.82rem' }}>
                                            Error: {aiSummary.error}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '10px' }}>
                                    Detection List
                                </div>
                                {aiDetections.length > 0 ? (
                                    <DataTable headers={['Class', 'Normalized Class', 'Confidence', 'Bounding Box']}>
                                        {aiDetections.map((detection, index) => (
                                            <tr key={`${detection.class}-${index}`}>
                                                <td>{formatClassLabel(detection.class)}</td>
                                                <td>{formatClassLabel(detection.normalizedClass, 'N/A')}</td>
                                                <td>
                                                    {formatConfidence(detection.confidence)}
                                                    {detection.confidenceLevel ? ` (${detection.confidenceLevel})` : ''}
                                                </td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                    {detection.bbox
                                                        ? `x:${detection.bbox.x ?? '-'} y:${detection.bbox.y ?? '-'} w:${detection.bbox.width ?? '-'} h:${detection.bbox.height ?? '-'}`
                                                        : 'N/A'}
                                                </td>
                                            </tr>
                                        ))}
                                    </DataTable>
                                ) : (
                                    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                                        No AI detections are available for this report.
                                    </div>
                                )}
                            </div>
                        </div>
                    </Panel>
                    <Panel title="Officer Actions" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                            {/* Timeline entry */}
                            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-border)', marginTop: '6px', flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontWeight: '500' }}>Citizen Report Received</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{new Date(report.createdAt).toLocaleString()}</div>
                                    {report.vehicle?.notes && (
                                        <div style={{ fontSize: '0.75rem', fontStyle: 'italic', marginTop: '4px', color: 'var(--color-text-secondary)' }}>
                                            "{report.vehicle.notes}"
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Status-dependent timeline entries */}
                            {isUnderReview && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', marginTop: '6px', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '500', color: '#f59e0b' }}>Case Taken for Review</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Awaiting officer decision</div>
                                    </div>
                                </div>
                            )}

                            {isVerified && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', marginTop: '6px', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '500', color: '#10b981' }}>Violation Verified & Approved</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                            {isEvidenceReport ? 'Ready to be closed after review completion' : 'Fine has been issued'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isRejected && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', marginTop: '6px', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '500', color: '#ef4444' }}>Rejected (False Positive)</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Case dismissed by officer</div>
                                    </div>
                                </div>
                            )}

                            {isClosed && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2563eb', marginTop: '6px', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '500', color: '#2563eb' }}>Case Closed</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>No further officer action is required</div>
                                    </div>
                                </div>
                            )}

                            {/* Ticket success banner */}
                            {ticketLoading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', padding: 'var(--space-2) 0' }}>
                                    <Loader2 size={16} className="spin" /> Checking ticket status...
                                </div>
                            )}
                            {ticket && (
                                <div style={{
                                    padding: 'var(--space-4)',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-3)'
                                }}>
                                    <ClipboardCheck size={24} color="#10b981" style={{ alignSelf: 'flex-start', marginTop: '2px' }} />
                                    <div style={{ width: '100%' }}>
                                        <div style={{ fontWeight: '700', color: '#10b981', fontSize: '1rem', marginBottom: '8px' }}>Fine Issued</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'var(--color-text)' }}>
                                            <div><strong>Ticket Number:</strong> {ticket.ticketNumber}</div>
                                            <div><strong>Status:</strong> <Badge variant="neutral">{ticket.status.toUpperCase()}</Badge></div>
                                            <div><strong>Penal Code:</strong> {ticket.penalCode}</div>
                                            <div><strong>Fine Amount:</strong> Rs. {ticket.fineAmount}</div>
                                            <div><strong>Due Date:</strong> {ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : 'Pending'}</div>
                                            <div><strong>Payment Status:</strong> {ticket.paidAt ? 'Paid' : 'Unpaid'}</div>
                                            {ticket.appealReason && <div style={{ gridColumn: '1 / -1' }}><strong>Appeal Status:</strong> {ticket.status === 'appealed' ? 'Under Review' : 'Resolved'}</div>}
                                        </div>
                                        <div style={{ marginTop: 'var(--space-3)' }}>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                leftIcon={<Download size={14} />}
                                                onClick={() => {
                                                    mockDb.downloadTicketNoticePdf(ticket.id, ticket.ticketNumber).catch(err => {
                                                        alert(err.message || 'Failed to download PDF notice');
                                                    });
                                                }}
                                            >
                                                Download Notice (PDF)
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                            {/* Officer Notes */}
                            {!isClosed && (
                                <>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '8px' }}>
                                        Officer Notes
                                    </label>
                                    <textarea
                                        value={officerNotes}
                                        onChange={(e) => setOfficerNotes(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: 'var(--space-3)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            backgroundColor: 'var(--color-bg-secondary)',
                                            minHeight: '80px',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            marginBottom: 'var(--space-4)',
                                            color: 'var(--color-text)'
                                        }}
                                        placeholder="Add notes regarding the evidence..."
                                    />
                                </>
                            )}

                            {/* Ticket Issuance Form */}
                            {showTicketForm && !ticket && !isEvidenceReport && (
                                <div style={{
                                    padding: 'var(--space-4)',
                                    backgroundColor: 'rgba(59, 130, 246, 0.05)',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    borderRadius: 'var(--radius-md)',
                                    marginBottom: 'var(--space-4)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--space-3)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--color-text)' }}>
                                            <ClipboardCheck size={16} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                            Issue Traffic Ticket
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={isOverride} 
                                                onChange={(e) => setIsOverride(e.target.checked)} 
                                            />
                                            Manual Override
                                        </label>
                                    </div>
                                    
                                    {!isOverride && fineRule && (
                                        <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', fontSize: '0.85rem' }}>
                                            <div style={{ marginBottom: '4px' }}><strong>Default Rule Applied:</strong> {fineRule.description}</div>
                                            <div><strong>Penal Code:</strong> {fineRule.penalCode}</div>
                                            <div><strong>Fine Amount:</strong> {fineRule.currency} {fineRule.fineAmount}</div>
                                        </div>
                                    )}

                                    {(!fineRule && !isOverride) && (
                                        <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                                            No default fine rule found for this violation. You must override.
                                        </div>
                                    )}

                                    {isOverride && (
                                        <>
                                            <Input
                                                label="Penal Code"
                                                value={penalCode}
                                                onChange={(e) => setPenalCode(e.target.value)}
                                                fullWidth
                                            />
                                            <Input
                                                label="Fine Amount (Rs.)"
                                                type="number"
                                                value={fineAmount}
                                                onChange={(e) => setFineAmount(e.target.value)}
                                                fullWidth
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Override Reason <span style={{ color: '#ef4444' }}>*</span></label>
                                                <textarea
                                                    value={overrideReason}
                                                    onChange={(e) => setOverrideReason(e.target.value)}
                                                    placeholder="Required justification for changing the default rule..."
                                                    style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '4px', resize: 'vertical', minHeight: '60px', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
                                                />
                                            </div>
                                        </>
                                    )}
                                    {ticketError && (
                                        <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '4px 0' }}>{ticketError}</div>
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

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                {/* Step 1: Take Case (SUBMITTED → UNDER_REVIEW) */}
                                {isSubmitted && (
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        leftIcon={actionLoading ? <Loader2 size={18} /> : <AlertTriangle size={18} />}
                                        onClick={() => handleStatusUpdate('under-review')}
                                        disabled={actionLoading}
                                    >
                                        {actionLoading ? 'Processing...' : 'Take Case for Review'}
                                    </Button>
                                )}

                                {/* Step 2: Approve or Reject (UNDER_REVIEW → VALIDATED/REJECTED) */}
                                {isUnderReview && (
                                    <>
                                        <Button
                                            variant="primary"
                                            fullWidth
                                            leftIcon={actionLoading ? <Loader2 size={18} /> : <CheckCircle size={18} />}
                                            onClick={() => handleStatusUpdate('verified')}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? 'Processing...' : 'Approve & Issue Fine'}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            fullWidth
                                            leftIcon={<XCircle size={18} />}
                                            style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                            onClick={() => handleStatusUpdate('rejected')}
                                            disabled={actionLoading}
                                        >
                                            Reject (False Positive)
                                        </Button>
                                    </>
                                )}

                                {/* Re-open AI-rejected case for manual review */}
                                {isRejected && !ticket && (
                                    <>
                                        <Button
                                            variant="primary"
                                            fullWidth
                                            leftIcon={actionLoading ? <Loader2 size={18} /> : <AlertTriangle size={18} />}
                                            onClick={() => handleStatusUpdate('under-review')}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? 'Processing...' : 'Re-open for Manual Review'}
                                        </Button>
                                        {isEvidenceReport && (
                                            <Button
                                                variant="outline"
                                                fullWidth
                                                onClick={() => handleStatusUpdate('closed')}
                                                disabled={actionLoading}
                                            >
                                                Close Case
                                            </Button>
                                        )}
                                    </>
                                )}

                                {/* Issue ticket for verified cases */}
                                {isVerified && !showTicketForm && !ticket && (
                                    isEvidenceReport ? (
                                        <Button
                                            variant="outline"
                                            fullWidth
                                            onClick={() => handleStatusUpdate('closed')}
                                            disabled={actionLoading}
                                        >
                                            Close Case
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            fullWidth
                                            leftIcon={<ClipboardCheck size={18} />}
                                            onClick={() => openTicketForm(report)}
                                        >
                                            Issue Traffic Ticket
                                        </Button>
                                    )
                                )}

                                {(isResolved || isClosed) && (
                                    <Button
                                        variant="outline"
                                        fullWidth
                                        onClick={() => navigate('/dashboard/queue')}
                                    >
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
