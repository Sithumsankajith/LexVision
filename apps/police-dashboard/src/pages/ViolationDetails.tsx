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
import styles from './ViolationDetails.module.css';

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
                <span style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'uppercase'
                }}>
                    Pending Review
                </span>
            </div>

            <div className={styles.detailsContainer}>
                {/* Left Column: Evidence */}
                <div className={styles.evidenceColumn}>
                    {/* Viewer */}
                    <div className={styles.evidenceViewer}>
                        <div className={styles.evidencePlaceholder}>
                            <PlayCircle size={64} />
                            <span>Playback Evidence Clip</span>
                            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>00:15 / 1080p / 30fps</span>
                        </div>
                    </div>

                    {/* Metadata Strip */}
                    <div className={styles.metadataCard}>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}><Car size={14} style={{ verticalAlign: 'text-bottom' }} /> License Plate</span>
                            <span className={styles.metaValue}>WP CAA-1234</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}><AlertTriangle size={14} style={{ verticalAlign: 'text-bottom' }} /> Violation</span>
                            <span className={styles.metaValue}>Red Light</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}><Calendar size={14} style={{ verticalAlign: 'text-bottom' }} /> Time</span>
                            <span className={styles.metaValue}>Today, 10:42 AM</span>
                        </div>
                        <div className={styles.metaItem}>
                            <span className={styles.metaLabel}><MapPin size={14} style={{ verticalAlign: 'text-bottom' }} /> Location</span>
                            <span className={styles.metaValue}>Galle Rd, Col 03</span>
                        </div>
                    </div>
                </div>

                {/* Right Column: Actions */}
                <div className={styles.actionColumn}>
                    <div className={styles.actionPanel}>
                        <div className={styles.actionHeader}>
                            <h3 className={styles.actionTitle}>Officer Actions</h3>
                        </div>

                        <div className={styles.timeline}>
                            <div className={styles.timelineItem}>
                                <div className={styles.timelineDot} style={{ backgroundColor: '#3b82f6' }} />
                                <div className={styles.timelineContent}>
                                    <div style={{ fontWeight: '500' }}>AI Detection</div>
                                    <div className={styles.timelineTime}>Today, 10:42 AM</div>
                                </div>
                            </div>
                            <div className={styles.timelineItem}>
                                <div className={styles.timelineDot} />
                                <div className={styles.timelineContent}>
                                    <div style={{ fontWeight: '500' }}>Assigned to Officer Perera</div>
                                    <div className={styles.timelineTime}>Today, 10:45 AM</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '8px' }}>
                                Officer Notes
                            </label>
                            <textarea
                                className={styles.notesArea}
                                placeholder="Add notes regarding the evidence..."
                            />
                        </div>

                        <div className={styles.actionButtons}>
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
                </div>
            </div>
        </div>
    );
};
