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
    Image as ImageIcon,
    FileText,
    ClipboardCheck,
    Loader2
} from 'lucide-react';
import { Button, Input } from '@lexvision/ui';
import { Panel, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const ViolationDetails: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [officerNotes, setOfficerNotes] = useState('');

    // Ticket issuance state
    const [showTicketForm, setShowTicketForm] = useState(false);
    const [penalCode, setPenalCode] = useState('MV-ACT-2007-S129');
    const [fineAmount, setFineAmount] = useState('2500');
    const [ticketIssued, setTicketIssued] = useState(false);
    const [ticketError, setTicketError] = useState('');

    useEffect(() => {
        const fetchReport = async () => {
            if (id) {
                const data = await mockDb.getReportById(id);
                setReport(data);
                // If report is already verified, check for ticket
                if (data && data.status === 'verified') {
                    setTicketIssued(false); // Will be set when ticket issued within session
                }
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
                    setShowTicketForm(true);
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

    const handleIssueTicket = async () => {
        if (!report) return;
        setActionLoading(true);
        setTicketError('');
        try {
            await mockDb.issueTicket(report.id, penalCode, parseFloat(fineAmount));
            setTicketIssued(true);
            setShowTicketForm(false);
        } catch (e: any) {
            setTicketError(e.message || 'Failed to issue ticket');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Case...</div>;
    if (!report) return <div style={{ padding: '2rem', textAlign: 'center' }}>Case not found.</div>;

    const mainEvidence = report.evidence[0];

    // Determine available actions based on current status
    const isEvidenceReport = report.source === 'evidence-report';
    const isSubmitted = report.status === 'submitted';
    const isUnderReview = report.status === 'under-review';
    const isVerified = report.status === 'verified';
    const isRejected = report.status === 'rejected';
    const isClosed = report.status === 'closed';
    const isResolved = isVerified || isRejected;

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
                    {report.aiAnalysis?.detectedViolationType ? (
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
                        backgroundColor: '#000',
                        borderRadius: 'var(--radius-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: '400px'
                    }}>
                        {mainEvidence?.type === 'image' ? (
                            <img src={mainEvidence.url} alt="Evidence" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        ) : (
                            <div style={{ color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                                {mainEvidence?.type === 'video' ? <PlayCircle size={64} /> : <ImageIcon size={64} />}
                                <span>{mainEvidence ? 'Playback Evidence Clip' : 'No Evidence Available'}</span>
                            </div>
                        )}
                    </div>

                    {/* Metadata Strip */}
                    <Panel className="metadata-card" style={{ padding: 'var(--space-5)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }} noPadding>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><Car size={14} style={{ verticalAlign: 'text-bottom' }} /> License Plate</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{report.aiAnalysis?.detectedPlate || report.vehicle?.plate || 'Unknown'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><AlertTriangle size={14} style={{ verticalAlign: 'text-bottom' }} /> Violation</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{report.violationType.replace(/-/g, ' ')}</span>
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
                    <Panel title="Officer Actions" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                            {/* AI Detection info */}
                            {report.aiAnalysis && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3b82f6', marginTop: '6px', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <BrainCircuit size={14} /> AI Detection Alert
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            The model detected a potential <strong>{report.aiAnalysis.detectedViolationType}</strong> violation
                                            with <strong>{((report.aiAnalysis.confidence || 0) * 100).toFixed(0)}%</strong> confidence.
                                            {report.aiAnalysis.detectedPlate && <span> Reading plate: <strong>{report.aiAnalysis.detectedPlate}</strong>.</span>}
                                        </div>
                                    </div>
                                </div>
                            )}

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
                            {ticketIssued && (
                                <div style={{
                                    padding: 'var(--space-4)',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-3)'
                                }}>
                                    <ClipboardCheck size={20} color="#10b981" />
                                    <div>
                                        <div style={{ fontWeight: '700', color: '#10b981', fontSize: '0.875rem' }}>Ticket Issued Successfully</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                            Penal Code: {penalCode} | Fine: Rs. {fineAmount}
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
                            {showTicketForm && !ticketIssued && !isEvidenceReport && (
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
                                    <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--color-text)' }}>
                                        <ClipboardCheck size={16} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                        Issue Traffic Ticket
                                    </div>
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
                                    {ticketError && (
                                        <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '4px 0' }}>{ticketError}</div>
                                    )}
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        leftIcon={actionLoading ? <Loader2 size={16} className="spin" /> : <ClipboardCheck size={16} />}
                                        onClick={handleIssueTicket}
                                        disabled={actionLoading || !penalCode || !fineAmount}
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
                                {isRejected && !ticketIssued && (
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
                                {isVerified && !showTicketForm && !ticketIssued && (
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
                                            onClick={() => setShowTicketForm(true)}
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
