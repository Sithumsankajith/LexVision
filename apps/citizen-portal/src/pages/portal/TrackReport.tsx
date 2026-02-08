import React, { useState } from 'react';
import { Search, AlertCircle, MapPin, Video } from 'lucide-react';
import { Card, Input, Button, Stepper } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report, ReportStatus } from '@lexvision/types';
import styles from '@/pages/portal/TrackReport.module.css';

const STATUS_STEPS = [
    { id: 1, label: 'Submitted' },
    { id: 2, label: 'Under Review' },
    { id: 3, label: 'Verified' },
    { id: 4, label: 'Forwarded' },
];

export const TrackReport: React.FC = () => {
    const [searchId, setSearchId] = useState('');
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');


    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchId) return;

        setLoading(true);
        setError('');
        setReport(null);


        try {
            const result = await mockDb.getReportByTrackingId(searchId.trim());
            if (result) {
                setReport(result);
            } else {
                setError('No report found with this Tracking ID. Please check and try again.');
            }
        } catch (err) {
            setError('An error occurred while fetching the report.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusStep = (status: ReportStatus) => {
        switch (status) {
            case 'submitted': return 1;
            case 'under-review': return 2;
            case 'verified': return 3;
            case 'forwarded': return 4;
            case 'rejected': return 2; // Show as reviewing but maybe add a rejected state UI
            default: return 1;
        }
    };

    return (
        <div className="container" style={{ padding: 'var(--space-12) var(--space-4)', maxWidth: '800px' }}>
            <h1 className={styles.title}>Track Your Report</h1>

            <Card className={styles.searchCard} padding="lg">
                <form onSubmit={handleSearch} className="form-grid form-grid--2-col" style={{ alignItems: 'end' }}>
                    <Input
                        label="Tracking ID"
                        placeholder="e.g. LEX-2026-ABCD"
                        value={searchId}
                        onChange={(e) => setSearchId(e.target.value)}
                        fullWidth
                    />
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={loading}
                        leftIcon={<Search size={16} />}
                        fullWidth
                    >
                        Track Report
                    </Button>
                </form>
            </Card>

            {error && (
                <div style={{ textAlign: 'center', color: 'var(--color-error)' }}>
                    <AlertCircle style={{ marginBottom: '8px' }} />
                    <p>{error}</p>
                </div>
            )}

            {report && (
                <div className={styles.resultContainer}>
                    <div className={styles.statusHeader}>
                        <div>
                            <div className={styles.reportId}>{report.trackingId}</div>
                            <small style={{ color: 'var(--color-text-secondary)' }}>
                                Submitted on {new Date(report.createdAt).toLocaleDateString()}
                            </small>
                        </div>
                        <div className={`${styles.statusBadge} ${styles[`status-${report.status}`]}`}>
                            {report.status.replace('-', ' ')}
                        </div>
                    </div>

                    <div style={{ margin: '40px 0' }}>
                        <Stepper
                            steps={STATUS_STEPS}
                            currentStep={getStatusStep(report.status)}
                        />
                    </div>

                    <Card padding="lg">
                        <h3>Report Summary</h3>
                        <div className={styles.detailsGrid}>
                            <div className={styles.detailSection}>
                                <h3><AlertCircle size={18} /> Violation Details</h3>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Type</span>
                                    <span className={styles.detailValue} style={{ textTransform: 'capitalize' }}>
                                        {report.violationType.replace('-', ' ')}
                                    </span>
                                </div>
                                {report.vehicle.plate && (
                                    <div className={styles.detailRow}>
                                        <span className={styles.detailLabel}>Vehicle Type</span>
                                        <span className={styles.detailValue}>{report.vehicle.type || 'N/A'}</span>
                                    </div>
                                )}
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Description</span>
                                    <span className={styles.detailValue}>{report.vehicle.notes || 'No description provided'}</span>
                                </div>
                            </div>

                            <div className={styles.detailSection}>
                                <h3><MapPin size={18} /> Location & Time</h3>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Location</span>
                                    <span className={styles.detailValue}>{report.location.address}</span>
                                </div>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>City</span>
                                    <span className={styles.detailValue}>{report.location.city}</span>
                                </div>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Date/Time</span>
                                    <span className={styles.detailValue}>
                                        {new Date(report.datetime).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '24px' }}>
                            <h3 style={{ fontSize: '1.125rem', marginBottom: '16px', color: 'var(--color-text-secondary)' }}>
                                <Video size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                                Evidence Preview
                            </h3>
                            <div className={styles.evidencePreview}>
                                <p>Evidence files (Images/Videos) are secure and only visible to reviewers.</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
