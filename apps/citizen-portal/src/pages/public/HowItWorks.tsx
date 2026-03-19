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

            <div className={styles.steps}>
                <div className={styles.step}>
                    <div className={styles.stepHeader}>
                        <div className={styles.stepNumber}>1</div>
                        <div className={styles.line}></div>
                    </div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Eye size={40} /></div>
                        <h3>Spot a Violation</h3>
                        <p>You witness a serious traffic violation that endangers safety on the road.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepHeader}>
                        <div className={styles.stepNumber}>2</div>
                        <div className={styles.line}></div>
                    </div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Camera size={40} /></div>
                        <h3>Submit Evidence</h3>
                        <p>Quickly upload photos or videos through our secure portal with location details.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepHeader}>
                        <div className={styles.stepNumber}>3</div>
                        <div className={styles.line}></div>
                    </div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><ShieldCheck size={40} /></div>
                        <h3>Authority Review</h3>
                        <p>LexVision AI and traffic authorities verify the evidence for legal validity.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepHeader}>
                        <div className={styles.stepNumber}>4</div>
                    </div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Gavel size={40} /></div>
                        <h3>Action Taken</h3>
                        <p>Appropriate legal action is initiated to ensure accountability and safety.</p>
                    </Card>
                </div>
            </div>
        </div>
    );
};
