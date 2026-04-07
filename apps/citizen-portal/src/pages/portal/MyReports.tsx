import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, FileText, RefreshCcw, Smartphone } from 'lucide-react';
import { Button, Card } from '@lexvision/ui';
import { auth, mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';
import { getCitizenStatusLabel } from '@/lib/reportStatus';
import styles from './MyReports.module.css';

const getStatusClassName = (status: Report['status']) => {
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

export const MyReports: React.FC = () => {
    const navigate = useNavigate();
    const citizenSession = auth.getCitizenSession();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadReports = React.useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await mockDb.getCitizenMyReports();
            setReports(data);
        } catch (loadError: unknown) {
            const message = loadError instanceof Error ? loadError.message : 'Failed to load your reports.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReports();
    }, [loadReports]);

    const stats = useMemo(() => {
        const total = reports.length;
        const underReview = reports.filter((report) => report.status === 'under-review').length;
        const accepted = reports.filter((report) => report.status === 'verified' || report.status === 'closed').length;
        return { total, underReview, accepted };
    }, [reports]);

    if (loading) {
        return <div className={styles.centerState}>Loading your reports...</div>;
    }

    if (error) {
        return (
            <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <Card className={styles.stateCard} padding="lg">
                    <AlertCircle size={42} className={styles.stateIconError} />
                    <h1>Unable to Load Your Reports</h1>
                    <p>{error}</p>
                    <div className={styles.stateActions}>
                        <Button variant="primary" leftIcon={<RefreshCcw size={16} />} onClick={loadReports}>
                            Retry
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                auth.logoutCitizen();
                                navigate('/login', { replace: true });
                            }}
                        >
                            Verify Again
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className={styles.header}>
                <div className={styles.headerInfo}>
                    <div className={styles.avatar}>
                        <Smartphone size={34} />
                    </div>
                    <div>
                        <h1>My Reports</h1>
                        <p>{citizenSession?.phone_number || 'Verified citizen account'}</p>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/portal/report')}>
                        Submit New Report
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            auth.logoutCitizen();
                            navigate('/portal');
                        }}
                    >
                        Sign Out
                    </Button>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statLabel}>Total Reports</div>
                    <div className={styles.statValue}>{stats.total}</div>
                </Card>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statLabel}>Under Review</div>
                    <div className={styles.statValue}>{stats.underReview}</div>
                </Card>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statLabel}>Accepted / Closed</div>
                    <div className={styles.statValue}>{stats.accepted}</div>
                </Card>
            </div>

            {reports.length === 0 ? (
                <Card className={styles.stateCard} padding="lg">
                    <FileText size={42} className={styles.stateIconInfo} />
                    <h2>No Reports Yet</h2>
                    <p>Your verified phone number does not have any submitted evidence reports yet.</p>
                    <div className={styles.stateActions}>
                        <Button variant="primary" onClick={() => navigate('/portal/report')}>
                            Report a Violation
                        </Button>
                        <Link to="/portal/track">
                            <Button variant="secondary">Track by Reference</Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <div className={styles.reportList}>
                    {reports.map((report) => (
                        <Link key={report.id} to={`/portal/my-reports/${report.id}`} className={styles.reportLink}>
                            <Card padding="md" className={styles.reportCard}>
                                <div className={styles.reportContent}>
                                    <div className={styles.reportHeader}>
                                        <div>
                                            <div className={styles.referenceLabel}>Report Reference</div>
                                            <div className={styles.referenceValue}>{report.trackingId}</div>
                                        </div>
                                        <span className={`${styles.statusBadge} ${getStatusClassName(report.status)}`}>
                                            {getCitizenStatusLabel(report.status)}
                                        </span>
                                    </div>

                                    <div className={styles.reportMeta}>
                                        <span><Clock3 size={14} /> Submitted {new Date(report.createdAt).toLocaleString()}</span>
                                        <span><CheckCircle2 size={14} /> Last updated {new Date(report.updatedAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                <ChevronRight size={18} className={styles.chevron} />
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};
