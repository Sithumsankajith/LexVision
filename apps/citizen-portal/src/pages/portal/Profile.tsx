import React, { useEffect, useState } from 'react';
import {
    User,
    Award,
    FileText,
    TrendingUp,
    CheckCircle,
    Clock,
    Gift,
    ChevronRight,
    Search
} from 'lucide-react';
import { Card, Button } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';
import styles from './Profile.module.css';

interface ProfileData {
    user: {
        email: string;
        reward_points: number;
    };
    reports_count: number;
    validated_reports_count: number;
    claimed_rewards: any[];
}

export const Profile: React.FC = () => {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [reports, setReports] = useState<Report[]>([]);
    const [availableRewards, setAvailableRewards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileRes, reportsRes, rewardsRes] = await Promise.all([
                    mockDb.getProfile(),
                    mockDb.getMyReports(),
                    mockDb.listRewards()
                ]);
                setProfile(profileRes);
                setReports(reportsRes);
                setAvailableRewards(rewardsRes);
            } catch (err) {
                console.error('Failed to fetch profile data', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleClaimReward = async (rewardId: string) => {
        setClaimingId(rewardId);
        try {
            await mockDb.claimReward(rewardId);
            // Refresh data
            const profileRes = await mockDb.getProfile();
            setProfile(profileRes);
            alert('Reward claimed successfully!');
        } catch (err: any) {
            alert(err.message || 'Failed to claim reward');
        } finally {
            setClaimingId(null);
        }
    };

    if (loading) return <div className={styles.loading}>Loading profile...</div>;
    if (!profile) return <div className={styles.error}>Error loading profile.</div>;

    return (
        <div className="container" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className={styles.header}>
                <div className={styles.userInfo}>
                    <div className={styles.avatar}>
                        <User size={40} />
                    </div>
                    <div>
                        <h1>{profile.user.email.split('@')[0]}</h1>
                        <p>{profile.user.email}</p>
                    </div>
                </div>
                <Card className={styles.pointsBadge} padding="sm">
                    <TrendingUp size={20} />
                    <span>{profile.user.reward_points} Points</span>
                </Card>
            </div>

            <div className={styles.statsGrid}>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#eff6ff', color: '#3b82f6' }}>
                        <FileText size={24} />
                    </div>
                    <div>
                        <div className={styles.statValue}>{profile.reports_count}</div>
                        <div className={styles.statLabel}>Total Reports</div>
                    </div>
                </Card>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#f0fdf4', color: '#22c55e' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <div className={styles.statValue}>{profile.validated_reports_count}</div>
                        <div className={styles.statLabel}>Validated</div>
                    </div>
                </Card>
                <Card padding="md" className={styles.statCard}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#faf5ff', color: '#a855f7' }}>
                        <Award size={24} />
                    </div>
                    <div>
                        <div className={styles.statValue}>{profile.claimed_rewards.length}</div>
                        <div className={styles.statLabel}>Rewards Earned</div>
                    </div>
                </Card>
            </div>

            <div className={styles.mainContent}>
                <div className={styles.leftCol}>
                    <div className={styles.sectionHeader}>
                        <h2>My Reports</h2>
                        <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/portal/track')}>
                            Track by ID <ChevronRight size={14} />
                        </Button>
                    </div>

                    <div className={styles.reportList}>
                        {reports.length === 0 ? (
                            <div className={styles.emptyState}>
                                <FileText size={48} />
                                <p>You haven't submitted any reports yet.</p>
                                <Button variant="primary" onClick={() => (window.location.href = '/portal/report')}>
                                    Report a Violation
                                </Button>
                            </div>
                        ) : (
                            reports.map((report) => (
                                <Card key={report.id} padding="md" className={styles.reportItem}>
                                    <div className={styles.reportMain}>
                                        <div className={styles.reportType}>
                                            <span className={`${styles.badge} ${styles[report.status]}`}>
                                                {report.status.replace('-', ' ')}
                                            </span>
                                            <h3>{report.violationType.replace('-', ' ')}</h3>
                                        </div>
                                        <div className={styles.reportMeta}>
                                            <span><Clock size={14} /> {new Date(report.createdAt).toLocaleDateString()}</span>
                                            <span><Search size={14} /> {report.trackingId}</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={20} color="#94a3b8" />
                                </Card>
                            ))
                        )}
                    </div>
                </div>

                <div className={styles.rightCol}>
                    <div className={styles.sectionHeader}>
                        <h2>Rewards Center</h2>
                    </div>
                    <div className={styles.rewardList}>
                        {availableRewards.map((reward) => (
                            <Card key={reward.id} padding="md" className={styles.rewardCard}>
                                <div className={styles.rewardInfo}>
                                    <h3>{reward.title}</h3>
                                    <p>{reward.description}</p>
                                    <div className={styles.costBadge}>
                                        <Gift size={14} />
                                        <span>{reward.points_cost} Pts</span>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    fullWidth
                                    onClick={() => handleClaimReward(reward.id)}
                                    disabled={profile.user.reward_points < reward.points_cost || claimingId === reward.id}
                                    isLoading={claimingId === reward.id}
                                >
                                    Claim Reward
                                </Button>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
