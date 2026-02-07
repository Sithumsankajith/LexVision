import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Database, ChevronRight, Activity, TrendingDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import styles from './Home.module.css';

export const Home: React.FC = () => {
    return (
        <div className={styles.home}>
            {/* Hero Section */}
            <section className={styles.hero}>
                <div className="container">
                    <div className={styles.heroInner}>
                        <div className={styles.heroContent}>
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
                        </div>
                        <div className={styles.heroImage}>
                            {/* Placeholder for Hero Graphic */}
                            <div className={styles.heroGraphic}>
                                <Activity size={120} strokeWidth={1} />
                                <span>Road Safety Analytics</span>
                            </div>
                        </div>
                    </div>
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

            {/* Problem Statement */}
            <section className={styles.problem}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <h2>Why LexVision?</h2>
                        <p>Road safety in Sri Lanka requires a collaborative effort.</p>
                    </div>
                    <div className={styles.problemGrid}>
                        <Card className={styles.problemCard}>
                            <TrendingDown className={styles.problemIcon} size={40} />
                            <h3>Reduce Accidents</h3>
                            <p>Timely reporting helps identify high-risk areas and behaviors.</p>
                        </Card>
                        <Card className={styles.problemCard}>
                            <Eye className={styles.problemIcon} size={40} />
                            <h3>Traffic Discipline</h3>
                            <p>Promoting adherence to road rules through monitoring.</p>
                        </Card>
                        <Card className={styles.problemCard}>
                            <Database className={styles.problemIcon} size={40} />
                            <h3>Data-Driven Policy</h3>
                            <p>Gathering insights to improve traffic management strategies.</p>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Features Preview */}
            <section className={styles.features}>
                <div className="container">
                    <div className={styles.sectionHeader}>
                        <h2>What We Detect</h2>
                        <p>Our system focuses on critical violations that impact safety.</p>
                    </div>
                    <div className={styles.featureGrid}>
                        <Card className={styles.featureCard}>
                            <h3>No Helmet</h3>
                            <p>Detecting riders without proper safety gear.</p>
                        </Card>
                        <Card className={styles.featureCard}>
                            <h3>Red Light Violation</h3>
                            <p>Identifying vehicles crossing intersections illegally.</p>
                        </Card>
                        <Card className={styles.featureCard}>
                            <h3>White Line Crossing</h3>
                            <p>Monitoring lane discipline and overtaking rules.</p>
                        </Card>
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
