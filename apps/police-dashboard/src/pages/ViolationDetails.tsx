import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    MapPin,
    Calendar,
    Car,
    AlertTriangle,
    CheckCircle,
    XCircle,
    MessageSquare,
    PlayCircle
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import { Panel, Badge } from '@lexvision/ui';

export const ViolationDetails: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Header / Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={16} /> Back
                </Button>
                <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Case #{id || 'AI-2026-992'}</h1>
                <Badge variant="warning">Pending Review</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)', height: 'calc(100vh - 140px)' }}>
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
                        overflow: 'hidden'
                    }}>
                        <div style={{ color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                            <PlayCircle size={64} />
                            <span>Playback Evidence Clip</span>
                            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>00:15 / 1080p / 30fps</span>
                        </div>
                    </div>

                    {/* Metadata Strip */}
                    <Panel className="metadata-card" style={{ padding: 'var(--space-5)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }} noPadding>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><Car size={14} style={{ verticalAlign: 'text-bottom' }} /> License Plate</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>WP CAA-1234</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><AlertTriangle size={14} style={{ verticalAlign: 'text-bottom' }} /> Violation</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>Red Light</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><Calendar size={14} style={{ verticalAlign: 'text-bottom' }} /> Time</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>Today, 10:42 AM</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: '600' }}><MapPin size={14} style={{ verticalAlign: 'text-bottom' }} /> Location</span>
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>Galle Rd, Col 03</span>
                        </div>
                    </Panel>
                </div>

                {/* Right Column: Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
                    <Panel title="Officer Actions" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#3b82f6', marginTop: '6px' }} />
                                <div>
                                    <div style={{ fontWeight: '500' }}>AI Detection</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Today, 10:42 AM</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: '0.875rem' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-border)', marginTop: '6px' }} />
                                <div>
                                    <div style={{ fontWeight: '500' }}>Assigned to Officer Perera</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Today, 10:45 AM</div>
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
                                <Button variant="primary" fullWidth leftIcon={<CheckCircle size={18} />}>
                                    Approve & Issue Fine
                                </Button>
                                <Button variant="secondary" fullWidth leftIcon={<MessageSquare size={18} />}>
                                    Request More Info
                                </Button>
                                <Button variant="outline" fullWidth leftIcon={<XCircle size={18} />} style={{ color: '#ef4444', borderColor: '#ef4444' }}>
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
