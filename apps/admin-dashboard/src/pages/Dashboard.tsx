import React from 'react';
import {
    Users,
    AlertCircle,
    CheckCircle,
    XCircle,
    TrendingUp,
    TrendingDown,
    MoreHorizontal
} from 'lucide-react';
import { Card, Button } from '@lexvision/ui';
import styles from './Dashboard.module.css';

// Mock Data
const KPIS = [
    { label: 'Total Reports', value: '1,234', trend: '+12%', isUp: true, icon: <Users size={20} color="#3b82f6" /> },
    { label: 'Pending Review', value: '56', trend: '-5%', isUp: false, icon: <AlertCircle size={20} color="#f59e0b" /> },
    { label: 'Verified', value: '892', trend: '+8%', isUp: true, icon: <CheckCircle size={20} color="#10b981" /> },
    { label: 'Rejected', value: '286', trend: '+2%', isUp: false, icon: <XCircle size={20} color="#ef4444" /> },
];

const RECENT_ACTIVITY = [
    { time: '10:42 AM', action: 'Officer Silva verified Report #LEX-982' },
    { time: '10:15 AM', action: 'New report submitted via Portal' },
    { time: '09:30 AM', action: 'System blocked 3 duplicate submissions' },
    { time: '09:12 AM', action: 'Admin logged in from new device' },
    { time: 'Yesterday', action: 'Weekly summary report generated' },
];

const RECENT_REPORTS = [
    { id: 'LEX-2026-A1', type: 'Red Light', date: '2026-02-08', status: 'new', location: 'Duplication Rd, Col 03' },
    { id: 'LEX-2026-A2', type: 'No Helmet', date: '2026-02-08', status: 'review', location: 'Galle Rd, Col 04' },
    { id: 'LEX-2026-B5', type: 'Parking', date: '2026-02-07', status: 'approved', location: 'Union Place, Col 02' },
    { id: 'LEX-2026-C3', type: 'Lane Line', date: '2026-02-07', status: 'rejected', location: 'Baseline Rd, Col 09' },
    { id: 'LEX-2026-D9', type: 'No Helmet', date: '2026-02-07', status: 'approved', location: 'Havelock Rd, Col 05' },
];

export const Dashboard: React.FC = () => {
    return (
        <div className={styles.dashboardGrid}>

            {/* KPI Cards */}
            <section className={styles.kpiGrid}>
                {KPIS.map((kpi, index) => (
                    <div key={index} className={styles.kpiCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <span className={styles.kpiLabel}>{kpi.label}</span>
                            {kpi.icon}
                        </div>
                        <div className={styles.kpiValue}>{kpi.value}</div>
                        <div className={`${styles.kpiTrend} ${kpi.isUp ? styles.trendUp : styles.trendDown}`}>
                            {kpi.isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            <span>{kpi.trend} from last month</span>
                        </div>
                    </div>
                ))}
            </section>

            {/* Analytics & Activity */}
            <section className={styles.analyticsGrid}>
                {/* Visual Chart Placeholder */}
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Reports by Violation Type</h3>
                        <Button variant="ghost" size="sm"><MoreHorizontal size={16} /></Button>
                    </div>

                    <div className={styles.chartContainer}>
                        <div className={styles.chartBarWrapper}>
                            <div className={styles.chartBar} style={{ height: '60%', backgroundColor: '#ef4444' }}></div>
                            <span className={styles.barLabel}>Red Light</span>
                        </div>
                        <div className={styles.chartBarWrapper}>
                            <div className={styles.chartBar} style={{ height: '85%', backgroundColor: '#f59e0b' }}></div>
                            <span className={styles.barLabel}>Helmet</span>
                        </div>
                        <div className={styles.chartBarWrapper}>
                            <div className={styles.chartBar} style={{ height: '40%', backgroundColor: '#3b82f6' }}></div>
                            <span className={styles.barLabel}>Parking</span>
                        </div>
                        <div className={styles.chartBarWrapper}>
                            <div className={styles.chartBar} style={{ height: '55%', backgroundColor: '#10b981' }}></div>
                            <span className={styles.barLabel}>Lane</span>
                        </div>
                        <div className={styles.chartBarWrapper}>
                            <div className={styles.chartBar} style={{ height: '30%', backgroundColor: '#8b5cf6' }}></div>
                            <span className={styles.barLabel}>Other</span>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className={styles.sectionCard}>
                    <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>Recent Activity</h3>
                    </div>
                    <div className={styles.activityList}>
                        {RECENT_ACTIVITY.map((activity, i) => (
                            <div key={i} className={styles.activityItem}>
                                <div className={styles.activityTime}>{activity.time}</div>
                                <div className={styles.activityText}>{activity.action}</div>
                            </div>
                        ))}
                    </div>
                    <Button variant="secondary" fullWidth style={{ marginTop: 'auto' }}>
                        View All Log
                    </Button>
                </div>
            </section>

            {/* Recent Reports Table */}
            <Card padding="none" className={styles.tableContainer}>
                <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className={styles.sectionTitle}>Recent Reports</h3>
                    <Button size="sm" variant="outline">View All</Button>
                </div>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Tracking ID</th>
                            <th>Violation Type</th>
                            <th>Date</th>
                            <th>Location</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {RECENT_REPORTS.map((report) => (
                            <tr key={report.id}>
                                <td style={{ fontFamily: 'monospace' }}>{report.id}</td>
                                <td>{report.type}</td>
                                <td>{report.date}</td>
                                <td>{report.location}</td>
                                <td>
                                    <span className={`${styles.statusBadge} ${report.status === 'new' ? styles.statusNew :
                                            report.status === 'review' ? styles.statusReview :
                                                report.status === 'approved' ? styles.statusApproved :
                                                    styles.statusRejected
                                        }`}>
                                        {report.status.replace('-', ' ')}
                                    </span>
                                </td>
                                <td>
                                    <Button variant="ghost" size="sm">Review</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

        </div>
    );
};
