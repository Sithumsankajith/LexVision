import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, ChevronRight, AlertTriangle, FileText } from 'lucide-react';
import { Button, Card } from '@lexvision/ui';
import styles from './Home.module.css';

export const Home: React.FC = () => {
    return (
        <div className={styles.home}>
            {/* Hero Section */}
            <section className={styles.hero}>
                <div className={styles.videoBackground}>
                    <video
                        className={styles.heroVideo}
                        autoPlay
                        loop
                        muted
                        playsInline
                        poster="/images/hero-violation.png"
                    >
                        <source src="/media/hero-bg.mp4" type="video/mp4" />
                        {/* Fallback for when video is missing or loading */}
                        <img src="/images/hero-violation.png" alt="Traffic surveillance view" className={styles.heroFallbackImage} />
                    </video>
                    <div className={styles.heroOverlay}></div>
                </div>

                <div className={`container ${styles.heroContainer}`}>
                    <header className="page-header">
                        <h1 className={styles.heroTitle}>Making Roads Safer Through Active Citizen Participation</h1>
                        <p className={styles.heroSubtitle}>
                            LexVision empowers citizens to report road violations securely and transparently. Join us in creating a safer driving culture.
                        </p>
                        <div className={styles.heroActions}>
                            <Link to="/portal">
                                <Button size="lg" variant="primary" rightIcon={<ChevronRight />}>
                                    Open Citizen Portal
                                </Button>
                            </Link>
                            <Link to="/how-it-works">
                                <Button size="lg" variant="secondary">
                                    How it Works
                                </Button>
                            </Link>
                        </div>
                    </header>
                </div>
            </section>

            {/* Stats Band */}
            <section className={styles.stats}>
                <div className="container">
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>98%</div>
                            <div className={styles.statLabel}>Detection Accuracy</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>&lt; 24h</div>
                            <div className={styles.statLabel}>Verification Time</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>100%</div>
                            <div className={styles.statLabel}>Secure Evidence</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Problem Section */}
            <section className={styles.problem}>
                <div className="container">
                    <header className={styles.sectionHeader}>
                        <h2>The Problem</h2>
                        <p>Traffic violations are the leading cause of road accidents.</p>
                    </header>
                    <div className="card-grid">
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><AlertTriangle size={48} /></div>
                            <h3>Rising Accidents</h3>
                            <p>Over 3,000 fatal accidents occur annually due to reckless driving and negligence.</p>
                        </Card>
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><Eye size={48} /></div>
                            <h3>Lack of Surveillance</h3>
                            <p>Current manpower is insufficient to monitor all roads effectively 24/7.</p>
                        </Card>
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><FileText size={48} /></div>
                            <h3>Manual Reporting</h3>
                            <p>Existing reporting mechanisms are slow, cumbersome, and often ignored.</p>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className={styles.features}>
                <div className="container">
                    <header className={styles.sectionHeader}>
                        <h2>Key Features</h2>
                        <p>Advanced AI-powered detection for modern traffic management.</p>
                    </header>
                    <div className="card-grid">
                        <Link to="/features" className={styles.featureLink}>
                            <Card className={styles.featureCard} hoverable padding="lg">
                                <h3>Helmet Detection</h3>
                                <p>Automatically identifies riders without helmets.</p>
                            </Card>
                        </Link>
                        <Link to="/features" className={styles.featureLink}>
                            <Card className={styles.featureCard} hoverable padding="lg">
                                <h3>Red Light Violation</h3>
                                <p>Detects vehicles crossing red signals.</p>
                            </Card>
                        </Link>
                        <Link to="/features" className={styles.featureLink}>
                            <Card className={styles.featureCard} hoverable padding="lg">
                                <h3>License Plate OCR</h3>
                                <p>Extracts vehicle numbers for identification.</p>
                            </Card>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Architecture Preview */}
            <section className={styles.architecture}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <h2>How It Works</h2>
                    </div>
                    <div className={styles.architectureDiagram}>
                        <div className={styles.archStep}>Detect</div>
                        <div className={styles.archArrow}>→</div>
                        <div className={styles.archStep}>Verify</div>
                        <div className={styles.archArrow}>→</div>
                        <div className={styles.archStep}>Store</div>
                        <div className={styles.archArrow}>→</div>
                        <div className={styles.archStep}>Review</div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className={styles.cta}>
                <div className="container">
                    <div className={styles.ctaContent}>
                        <h2>Ready to make a difference?</h2>
                        <div className={styles.ctaButtons}>
                            <Link to="/portal/report">
                                <Button variant="primary" size="lg">Report a Violation</Button>
                            </Link>
                            <Link to="/portal/track">
                                <Button variant="outline" size="lg">Track Report</Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
