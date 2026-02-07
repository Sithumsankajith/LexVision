import React from 'react';
import { Camera, CheckCircle, Database, Bell, Eye } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from './HowItWorks.module.css';

export const HowItWorks: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <h1 className={styles.title}>How LexVision Works</h1>
            <p className={styles.subtitle}>A simple, transparent process to ensure road safety.</p>

            <div className={styles.steps}>
                <div className={styles.step}>
                    <div className={styles.stepNumber}>1</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Camera size={32} /></div>
                        <h3>Detect</h3>
                        <p>Citizens or automated cameras capture evidence of a traffic violation (image or video).</p>
                    </Card>
                </div>
                <div className={styles.connector}></div>
                <div className={styles.step}>
                    <div className={styles.stepNumber}>2</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><CheckCircle size={32} /></div>
                        <h3>Verify</h3>
                        <p>LexVision AI filters the submission, and authorized personnel verify the evidence manually.</p>
                    </Card>
                </div>
                <div className={styles.connector}></div>
                <div className={styles.step}>
                    <div className={styles.stepNumber}>3</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Database size={32} /></div>
                        <h3>Store</h3>
                        <p>Verified violations are securely stored in the government database with a tamper-proof audit trail.</p>
                    </Card>
                </div>
                <div className={styles.connector}></div>
                <div className={styles.step}>
                    <div className={styles.stepNumber}>4</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Bell size={32} /></div>
                        <h3>Notify</h3>
                        <p>The system generates a fine or warning, and the offender is notified via SMS or mail.</p>
                    </Card>
                </div>
            </div>

            <div className={styles.architecture}>
                <h2>System Architecture</h2>
                <div className={styles.diagram}>
                    <div className={styles.diagramBlock}>
                        <Eye size={24} />
                        <span>Input Sources</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Processing (AI + Human)</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Violation Database</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Citizen Portal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
