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
    Loader2,
    Download
} from 'lucide-react';
import { Button, Input } from '@lexvision/ui';
import { Panel, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report, FineRule, TrafficTicket } from '@lexvision/types';

const formatViolation = (value?: string | null, emptyLabel = 'Pending police validation') => value ? value.replace(/-/g, ' ') : emptyLabel;

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

    useEffect(() => {
        const fetchReport = async () => {
            if (id) {
                try {
                    const data = await mockDb.getReportById(id);
                    setReport(data);
                    
                    // If report is already verified or closed, check for ticket
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
                    }
                } catch (e) {
                    console.error("Failed to load case", e);
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
                    {report.aiAnalysis ? (
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
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>Final: {formatViolation(report.finalViolationType)}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Claimed: {formatViolation(report.claimedViolationType || report.violationType)}</span>
                            <span style={{ fontSize: '0.75rem', color: report.inferredViolationType ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                                AI inferred: {formatViolation(report.inferredViolationType, 'Not inferred')}
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
                                            Claimed violation: <strong>{formatViolation(report.claimedViolationType || report.violationType)}</strong>.
                                            {' '}AI inferred: <strong>{formatViolation(report.inferredViolationType, 'Not inferred')}</strong>.
                                            {' '}Confidence: <strong>{((report.aiAnalysis.confidence || 0) * 100).toFixed(0)}%</strong>
                                            {report.aiAnalysis.confidenceBand && <span> (<strong>{report.aiAnalysis.confidenceBand}</strong>)</span>}.
                                            {report.aiAnalysis.detectedPlate && <span> Plate read: <strong>{report.aiAnalysis.detectedPlate}</strong>.</span>}
                                            {report.aiAnalysis.modelVersion && <span> Model: <strong>{report.aiAnalysis.modelVersion}</strong>.</span>}
                                            {report.aiAnalysis.processedAt && <span> Processed: <strong>{new Date(report.aiAnalysis.processedAt).toLocaleString()}</strong>.</span>}
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
