import React from 'react';
import { Camera, Eye, ShieldCheck, Gavel } from 'lucide-react';
import { Card } from '@lexvision/ui';
import styles from './HowItWorks.module.css';

export const HowItWorks: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>How Reporting Works</h1>
                <p>A simple, transparent process to ensure road safety.</p>
            </header>

            <div className="card-grid">
                <div className={styles.step}>
                    <div className={styles.stepNumber}>1</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Eye size={32} /></div>
                        <h3>Spot a Violation</h3>
                        <p>You witness a serious traffic violation that endangers safety.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepNumber}>2</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Camera size={32} /></div>
                        <h3>Submit Evidence</h3>
                        <p>Upload a photo or video through our secure portal along with details.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepNumber}>3</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><ShieldCheck size={32} /></div>
                        <h3>Authority Review</h3>
                        <p>Police and traffic authorities review the evidence to verify the violation.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepNumber}>4</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Gavel size={32} /></div>
                        <h3>Action Taken</h3>
                        <p>If verified, appropriate legal action is taken to discourage repeat offenses.</p>
                    </Card>
                </div>
            </div>
        </div>
    );
};
