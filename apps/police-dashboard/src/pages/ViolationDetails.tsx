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
    FileText
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import { Panel, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const ViolationDetails: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        const fetchReport = async () => {
            if (id) {
                const data = await mockDb.getReportById(id);
                setReport(data);
            }
            setLoading(false);
        };
        fetchReport();
    }, [id]);

    const handleStatusUpdate = async (status: Report['status']) => {
        if (!report) return;
        setActionLoading(true);
        try {
            await mockDb.updateReportStatus(report.id, status);
            setReport({ ...report, status });
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div>Loading Case...</div>;
    if (!report) return <div>Case not found.</div>;

    const mainEvidence = report.evidence[0];

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
                                'success'
                }>
                    {report.status.toUpperCase()}
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
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{report.violationType.replace('-', ' ')}</span>
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
                            {report.aiAnalysis && (
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3b82f6', marginTop: '6px' }} />
                                    <div>
                                        <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <BrainCircuit size={14} /> AI Detection Alert
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            The model detected a potential <strong>{report.aiAnalysis.detectedViolationType}</strong> violation.
                                            {report.aiAnalysis.detectedPlate && <span> Reading plate: <strong>{report.aiAnalysis.detectedPlate}</strong>.</span>}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-border)', marginTop: '6px' }} />
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
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '8px' }}>
                                Officer Notes
                            </label>
                            <textarea
                                style={{
                                    width: '100%',
                                    padding: 'var(--space-3)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    minHeight: '100px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    marginBottom: 'var(--space-4)'
                                }}
                                placeholder="Add notes regarding the evidence..."
                            />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                <Button
                                    variant="primary"
                                    fullWidth
                                    leftIcon={<CheckCircle size={18} />}
                                    onClick={() => handleStatusUpdate('verified')}
                                    disabled={actionLoading || report.status === 'verified'}
                                >
                                    Approve & Issue Fine
                                </Button>
                                <Button
                                    variant="outline"
                                    fullWidth
                                    leftIcon={<XCircle size={18} />}
                                    style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                    onClick={() => handleStatusUpdate('rejected')}
                                    disabled={actionLoading || report.status === 'rejected'}
                                >
                                    Reject (False Positive)
                                </Button>
                            </div>
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
};
