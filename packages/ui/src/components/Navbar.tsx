import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ExternalLink } from 'lucide-react';
import { Button } from './Button';
import styles from './Navbar.module.css';

export const Navbar: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const location = useLocation();

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'How it Works', path: '/how-it-works' },
        { name: 'Features', path: '/features' },
        { name: 'Demo', path: '/demo' },
        { name: 'FAQ', path: '/faq' },
        { name: 'Contact', path: '/contact' },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <nav className={styles.navbar}>
            <div className={`container ${styles.container}`}>
                <Link to="/" className={styles.logo}>
                    <img src="/images/lexvision.png" alt="LexVision Logo" className={styles.logoIcon} style={{ height: '40px', width: 'auto' }} />
                    <span className={styles.logoText}>LexVision</span>
                </Link>

                {/* Desktop Nav (Centered) */}
                <div className={styles.desktopNav}>
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`${styles.navLink} ${isActive(link.path) ? styles.active : ''}`}
                        >
                            {link.name}
                        </Link>
                    ))}
                </div>

                {/* Right Actions (CTA + Mobile Toggle) */}
                <div className={styles.actions}>
                    <Link to="/portal">
                        <Button variant="primary" size="md" rightIcon={<ExternalLink size={16} />}>
                            Citizen Portal
                        </Button>
                    </Link>
                </div>

                {/* Mobile Menu Button */}
                <button className={styles.menuButton} onClick={toggleMenu} aria-label="Toggle menu">
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Mobile Nav */}
            {
                isMenuOpen && (
                    <div className={styles.mobileNav}>
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`${styles.mobileNavLink} ${isActive(link.path) ? styles.active : ''}`}
                                onClick={() => setIsMenuOpen(false)}
                            >
                                {link.name}
                            </Link>
                        ))}
                        <div className={styles.mobileNavFooter}>
                            <Link to="/portal" onClick={() => setIsMenuOpen(false)} style={{ width: '100%' }}>
                                <Button variant="primary" fullWidth rightIcon={<ExternalLink size={16} />}>
                                    Citizen Portal
                                </Button>
                            </Link>
                        </div>
                    </div>
                )
            }
        </nav >
    );
};
