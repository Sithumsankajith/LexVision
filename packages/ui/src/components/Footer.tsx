import React from 'react';
import { Link } from 'react-router-dom';

import styles from './Footer.module.css';

export const Footer: React.FC = () => {
    return (
        <footer className={styles.footer}>
            <div className={`container ${styles.container}`}>
                <div className={styles.brand}>
                    <div className={styles.logo}>
                        <img src="/images/lexvision.png" alt="LexVision Logo" style={{ height: '32px', width: 'auto' }} />
                        <span>LexVision</span>
                    </div>
                    <p className={styles.tagline}>
                        Empowering citizens for safer roads through transparent reporting.
                    </p>
                </div>

                <div className={styles.column}>
                    <h4>Menu</h4>
                    <ul>
                        <li><Link to="/">Home</Link></li>
                        <li><Link to="/how-it-works">How it Works</Link></li>
                        <li><Link to="/features">Features</Link></li>
                        <li><Link to="/portal">Citizen Portal</Link></li>
                    </ul>
                </div>

                <div className={styles.column}>
                    <h4>Support</h4>
                    <ul>
                        <li><Link to="/faq">FAQ</Link></li>
                        <li><Link to="/contact">Contact Us</Link></li>
                        <li><Link to="/privacy">Privacy Policy</Link></li>
                        <li><Link to="/terms">Terms of Service</Link></li>
                    </ul>
                </div>
            </div>

            <div className={styles.bottomBar}>
                <div className={`container ${styles.bottomContainer}`}>
                    <p>&copy; {new Date().getFullYear()} LexVision Road Safety Initiative. All rights reserved.</p>
                    <div className={styles.accessibility}>
                        <Link to="/accessibility">Accessibility Statement</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};
