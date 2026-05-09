import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, FileText, RefreshCcw, Mail, Gift, Trophy, Star, MapPin } from 'lucide-react';
import { Button, Card } from '@lexvision/ui';
import { auth, mockDb } from '@lexvision/api-client';
import type { Report, Reward, UserProfile } from '@lexvision/types';
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
    const userSession = auth.getSession();

    const [reports, setReports] = useState<Report[]>([]);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    const loadDashboardData = React.useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [reportsData, profileData, rewardsData] = await Promise.all([
                mockDb.getPortalMyReports(),
                mockDb.getProfile().catch(() => null),
                mockDb.listRewards().catch(() => [])
            ]);

            setReports(reportsData);
            setProfile(profileData);
            setRewards(rewardsData);
        } catch (loadError: unknown) {
            const message = loadError instanceof Error ? loadError.message : 'Failed to load dashboard data.';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    const handleClaimReward = async (reward: Reward) => {
        if (!profile || profile.user.reward_points < reward.points_cost) {
            alert('You do not have enough points to claim this reward.');
            return;
        }

        setClaimingId(reward.id);
        try {
            await mockDb.claimReward(reward.id);
            alert(`Successfully claimed ${reward.title}!`);
            // Refresh data
            loadDashboardData();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to claim reward.');
        } finally {
            setClaimingId(null);
        }
    };

    const stats = useMemo(() => {
        const total = reports.length;
        const underReview = reports.filter((report) => report.status === 'under-review').length;
        const accepted = reports.filter((report) => report.status === 'verified' || report.status === 'closed').length;
        return { total, underReview, accepted };
    }, [reports]);

    if (loading) {
        return <div className={styles.centerState}>Loading your dashboard...</div>;
    }

    if (error) {
        return (
            <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <Card className={styles.stateCard} padding="lg">
                    <AlertCircle size={42} className={styles.stateIconError} />
                    <h1>Unable to Load Your Reports</h1>
                    <p>{error}</p>
                    <div className={styles.stateActions}>
                        <Button variant="primary" leftIcon={<RefreshCcw size={16} />} onClick={loadDashboardData}>
                            Retry
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                auth.logout();
                                navigate('/login', { replace: true });
                            }}
                        >
                            Sign In Again
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
                        <Mail size={34} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <h1 style={{ margin: 0 }}>My Reports</h1>
                            {profile && (
                                <div className={styles.pointsBadge}>
                                    <Trophy size={14} />
                                    <span>{profile.user.reward_points} Points</span>
                                </div>
                            )}
                        </div>
                        <p>{userSession?.email || 'Citizen account'}</p>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <Button variant="secondary" size="sm" onClick={() => navigate('/portal/report')}>
                        Submit New Report
                    </Button>
                    <Button
                        variant="whiteOutline"
                        size="sm"
                        onClick={() => {
                            auth.logout();
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
                {profile && (
                    <Card padding="md" className={`${styles.statCard} ${styles.pointsStatCard}`}>
                        <div className={styles.statLabel}>Available Points</div>
                        <div className={styles.statValue} style={{ color: 'var(--color-primary)' }}>
                            {profile.user.reward_points}
                        </div>
                    </Card>
                )}
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.reportsSection}>
                    <div className={styles.sectionHeader}>
                        <h2>Recent Reports</h2>
                        {reports.length > 0 && (
                            <Link to="/portal/track" className={styles.viewAll}>
                                View All
                            </Link>
                        )}
                    </div>

                    {reports.length === 0 ? (
                        <Card className={styles.stateCard} padding="lg">
                            <FileText size={42} className={styles.stateIconInfo} />
                            <h2>No Reports Yet</h2>
                            <p>You do not have any submitted reports on this signed-in account yet.</p>
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
                                                {report.location.district && <span><MapPin size={14} /> {report.location.district}</span>}
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className={styles.chevron} />
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                {rewards.length > 0 && (
                    <section className={styles.rewardsSection}>
                        <div className={styles.sectionHeader}>
                            <h2><Gift size={20} /> Rewards Shop</h2>
                        </div>
                        <div className={styles.rewardsGrid}>
                            {rewards.map((reward) => (
                                <Card key={reward.id} padding="md" className={styles.rewardCard}>
                                    {reward.image_url && (
                                        <div className={styles.rewardImage}>
                                            <img src={reward.image_url} alt={reward.title} />
                                        </div>
                                    )}
                                    <div className={styles.rewardInfo}>
                                        <h3>{reward.title}</h3>
                                        <p>{reward.description}</p>
                                        <div className={styles.rewardFooter}>
                                            <div className={styles.rewardCost}>
                                                <Star size={14} className={styles.starIcon} />
                                                <span>{reward.points_cost} Points</span>
                                            </div>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                disabled={!profile || profile.user.reward_points < reward.points_cost || claimingId === reward.id}
                                                onClick={() => handleClaimReward(reward)}
                                            >
                                                {claimingId === reward.id ? 'Claiming...' : 'Claim'}
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};
