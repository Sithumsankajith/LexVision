import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CalendarClock, Clock3, FileText, MapPin, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Button, Card, Stepper } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { CitizenReportDetail } from '@lexvision/types';
import { getCitizenStatusLabel, getCitizenStatusSourceLabel, getCitizenStatusStep } from '@/lib/reportStatus';
import styles from './MyReportDetail.module.css';

const STATUS_STEPS = [
    { id: 1, label: 'Submitted' },
    { id: 2, label: 'Under Review' },
    { id: 3, label: 'Accepted / Rejected' },
    { id: 4, label: 'Closed' },
];

const getStatusClassName = (status: CitizenReportDetail['status']) => {
    switch (status) {
        case 'under-review':
            return styles.statusUnderReview;
        case 'verified':
            return styles.statusAccepted;
        case 'rejected':
            return styles.statusRejected;
        case 'closed':
            return styles.statusClosed;
        default:
            return styles.statusSubmitted;
    }
};

export const MyReportDetail: React.FC = () => {
    const navigate = useNavigate();
    const { reportId } = useParams();
    const [report, setReport] = useState<CitizenReportDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadReport = React.useCallback(async () => {
        if (!reportId) {
            setError('Missing report reference.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await mockDb.getCitizenMyReportById(reportId);
            if (!data) {
                setError('This report could not be found for your verified phone number.');
                return;
            }
            setReport(data);
        } catch (loadError: unknown) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load the report details.');
        } finally {
            setLoading(false);
        }
    }, [reportId]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const history = useMemo(
        () => (report?.statusHistory ? [...report.statusHistory].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()) : []),
        [report],
    );

    if (loading) {
        return <div className={styles.centerState}>Loading report details...</div>;
    }

    if (error || !report) {
        return (
            <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <Card className={styles.stateCard} padding="lg">
                    <AlertCircle size={42} className={styles.stateIconError} />
                    <h1>Unable to Open This Report</h1>
                    <p>{error || 'This report is unavailable.'}</p>
                    <div className={styles.stateActions}>
                        <Button variant="primary" leftIcon={<RefreshCcw size={16} />} onClick={loadReport}>
                            Retry
                        </Button>
                        <Link to="/portal/my-reports">
                            <Button variant="secondary">Back to My Reports</Button>
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className={styles.topActions}>
                <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={16} />} onClick={() => navigate('/portal/my-reports')}>
                    Back to My Reports
                </Button>
            </div>

            <Card className={styles.summaryCard} padding="lg">
                <div className={styles.summaryHeader}>
                    <div>
                        <div className={styles.referenceLabel}>Report Reference</div>
                        <div className={styles.referenceValue}>{report.trackingId}</div>
                        <p className={styles.referenceMeta}>
                            Submitted on {new Date(report.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <span className={`${styles.statusBadge} ${getStatusClassName(report.status)}`}>
                        {getCitizenStatusLabel(report.status)}
                    </span>
                </div>

                <div className={styles.stepperWrap}>
                    <Stepper steps={STATUS_STEPS} currentStep={getCitizenStatusStep(report.status)} />
                </div>

                <div className={styles.metaGrid}>
                    <div className={styles.metaCard}>
                        <h3><ShieldCheck size={18} /> Current Status</h3>
                        <p>{getCitizenStatusLabel(report.status)}</p>
                    </div>
                    <div className={styles.metaCard}>
                        <h3><CalendarClock size={18} /> Last Update</h3>
                        <p>{new Date(report.updatedAt).toLocaleString()}</p>
                    </div>
                    <div className={styles.metaCard}>
                        <h3><FileText size={18} /> Violation Type</h3>
                        <p>{report.violationType.replace(/-/g, ' ')}</p>
                    </div>
                    <div className={styles.metaCard}>
                        <h3><MapPin size={18} /> Location</h3>
                        <p>{report.location.address || report.location.city || 'Location not available'}</p>
                    </div>
                </div>

                <div className={styles.detailGrid}>
                    <div className={styles.detailSection}>
                        <h3>Report Details</h3>
                        <div className={styles.detailRow}>
                            <span>Vehicle Number</span>
                            <strong>{report.vehicle.plate || 'Not provided'}</strong>
                        </div>
                        <div className={styles.detailRow}>
                            <span>Vehicle Type</span>
                            <strong>{report.vehicle.type || 'Not provided'}</strong>
                        </div>
                        <div className={styles.detailRow}>
                            <span>Incident Time</span>
                            <strong>{new Date(report.datetime).toLocaleString()}</strong>
                        </div>
                        <div className={styles.detailNotes}>
                            <span>Description</span>
                            <p>{report.vehicle.notes || 'No additional description was provided for this report.'}</p>
                        </div>
                    </div>

                    <div className={styles.detailSection}>
                        <h3>Status History</h3>
                        {history.length === 0 ? (
                            <div className={styles.timelineEmpty}>No status history has been recorded yet.</div>
                        ) : (
                            <div className={styles.timeline}>
                                {history.map((entry) => (
                                    <div key={entry.id} className={styles.timelineItem}>
                                        <div className={styles.timelineDot} />
                                        <div className={styles.timelineContent}>
                                            <div className={styles.timelineHeader}>
                                                <strong>{getCitizenStatusLabel(entry.newStatus)}</strong>
                                                <span>{getCitizenStatusSourceLabel(entry.source)}</span>
                                            </div>
                                            <div className={styles.timelineMeta}>
                                                <span><Clock3 size={13} /> {new Date(entry.changedAt).toLocaleString()}</span>
                                                {entry.previousStatus && (
                                                    <span>{getCitizenStatusLabel(entry.previousStatus)} {'->'} {getCitizenStatusLabel(entry.newStatus)}</span>
                                                )}
                                            </div>
                                            {entry.notes && <p className={styles.timelineNotes}>{entry.notes}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
