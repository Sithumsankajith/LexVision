import React from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Search, Info } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import styles from './PortalHome.module.css';

export const PortalHome: React.FC = () => {
    return (
        <div className={styles.portalHome}>
            <header className={styles.header}>
                <div className="container">
                    <h1>Citizen Portal</h1>
                    <p>Securely report road violations and track the status of your submissions.</p>
                </div>
            </header>

            <main className={`container ${styles.main}`}>
                <div className={styles.actions}>
                    <Link to="/portal/report" className={styles.actionLink}>
                        <Card className={styles.actionCard} hoverable padding="lg">
                            <PlusCircle size={48} className={styles.icon} />
                            <h2>Report a Violation</h2>
                            <p>Submit evidence of traffic violations. Help make our roads safer.</p>
                            <Button variant="primary" fullWidth>Start Report</Button>
                        </Card>
                    </Link>

                    <Link to="/portal/track" className={styles.actionLink}>
                        <Card className={styles.actionCard} hoverable padding="lg">
                            <Search size={48} className={styles.icon} />
                            <h2>Track My Report</h2>
                            <p>Check the status of your submitted reports using your Tracking ID.</p>
                            <Button variant="secondary" fullWidth>Check Status</Button>
                        </Card>
                    </Link>
                </div>

                <div className={styles.tips}>
                    <Card className={styles.tipsCard}>
                        <h3><Info size={20} /> How to submit good evidence</h3>
                        <ul>
                            <li>Ensure the license plate is clearly visible.</li>
                            <li>Include context of the violation (e.g., traffic light state).</li>
                            <li>Safety first: Do not endanger yourself to capture evidence.</li>
                            <li>Timestamped footage is preferred.</li>
                        </ul>
                    </Card>
                </div>
            </main>
        </div>
    );
};
