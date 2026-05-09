import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
    AlertCircle,
    Shield,
    Loader2,
    Mail,
    Eye,
    EyeOff,
    Search,
    Camera,
    FileSearch,
    Scale,
    Users,
    BadgeCheck,
    Settings,
} from 'lucide-react';
import { auth } from '@lexvision/api-client';
import { hasPendingReportDraftMarker } from '@/lib/reportDraft';
import styles from './Login.module.css';

const ADMIN_DASHBOARD_URL = import.meta.env.VITE_ADMIN_DASHBOARD_URL || 'http://localhost:5175';
const POLICE_DASHBOARD_URL = import.meta.env.VITE_POLICE_DASHBOARD_URL || 'http://localhost:5174/dashboard';

interface AuthRedirectState {
    from?: { pathname?: string; state?: unknown };
}

interface EmailFormErrors {
    email?: string;
    password?: string;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
};

const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const redirectParam = new URLSearchParams(location.search).get('redirect');
    const fromPath = redirectParam || navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const shouldRestoreDraft = fromPath === '/portal/report' && hasPendingReportDraftMarker();

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<EmailFormErrors>({});
    const [trackingId, setTrackingId] = useState('');

    React.useEffect(() => {
        const session = auth.getSession();
        if (!session) return;

        switch (session.role) {
            case 'ADMIN':
                window.location.href = ADMIN_DASHBOARD_URL;
                break;
            case 'POLICE':
                window.location.href = POLICE_DASHBOARD_URL;
                break;
            case 'CITIZEN':
                navigate(fromPath, {
                    replace: true,
                    state: shouldRestoreDraft ? { ...((fromState as object) || {}), draftRestored: true } : fromState,
                });
                break;
            default:
                navigate('/portal', { replace: true });
        }
    }, [fromPath, fromState, navigate, shouldRestoreDraft]);

    const redirectByRole = (role: string) => {
        switch (role) {
            case 'ADMIN':
                window.location.href = ADMIN_DASHBOARD_URL;
                break;
            case 'POLICE':
                window.location.href = POLICE_DASHBOARD_URL;
                break;
            default:
                navigate(fromPath, {
                    replace: true,
                    state: shouldRestoreDraft ? { ...((fromState as object) || {}), draftRestored: true } : fromState,
                });
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const errors: EmailFormErrors = {};
        if (!email.trim()) errors.email = 'Email is required';
        else if (!validateEmail(email)) errors.email = 'Enter a valid email address';
        if (!password.trim()) errors.password = 'Password is required';
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setIsLoading(true);
        try {
            const session = await auth.login(email, password);
            redirectByRole(session.role);
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Invalid email or password.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrackReport = () => {
        if (trackingId.trim()) {
            navigate(`/portal/track?id=${encodeURIComponent(trackingId.trim())}`);
        }
    };

    return (
        <div className={styles.loginPage}>
            <div className={styles.brandPanel}>
                <div className={styles.decorShape1} />
                <div className={styles.decorShape2} />
                <div className={styles.decorShape3} />

                <div className={styles.brandInner}>
                    <div className={styles.shieldIcon}>
                        <Shield size={28} color="#fff" />
                    </div>
                    <div className={styles.brandTitle}>LexVision</div>
                    <div className={styles.brandSubtitle}>
                        AI-assisted, Police-validated road safety system
                    </div>
                    <div className={styles.brandDescription}>
                        Submit and track traffic violations securely. AI assists detection, and Sri Lanka Traffic Police validate every case before action is taken.
                    </div>

                    <div className={styles.trustBadges}>
                        <div className={styles.trustItem}>
                            <span className={styles.trustItemIcon}><Camera size={16} /></span>
                            <span className={styles.trustItemText}>Submit traffic violation evidence</span>
                        </div>
                        <div className={styles.trustItem}>
                            <span className={styles.trustItemIcon}><FileSearch size={16} /></span>
                            <span className={styles.trustItemText}>Track reports securely</span>
                        </div>
                        <div className={styles.trustItem}>
                            <span className={styles.trustItemIcon}><BadgeCheck size={16} /></span>
                            <span className={styles.trustItemText}>Reviewed by Sri Lanka Traffic Police</span>
                        </div>
                    </div>

                    <div className={styles.roleInfo}>
                        <div className={styles.roleInfoTitle}>This system supports</div>
                        <div className={styles.roleChips}>
                            <span className={styles.roleChip}><Users size={11} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />Citizens</span>
                            <span className={styles.roleChip}><Scale size={11} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />Police</span>
                            <span className={styles.roleChip}><Settings size={11} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />Admin</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.formPanel}>
                <div className={styles.formCard}>
                    <div className={styles.formHeader}>
                        <h1>Welcome Back</h1>
                        <p>Sign in with your email and password to access the LexVision Citizen Portal</p>
                    </div>

                    {error && (
                        <div className={styles.errorBox}>
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className={styles.tabContent}>
                        <form onSubmit={handleEmailLogin}>
                            <div className={styles.formGroup}>
                                <label htmlFor="login-email" className={styles.formLabel}>Email Address</label>
                                <input
                                    id="login-email"
                                    type="email"
                                    className={`${styles.formInput} ${fieldErrors.email ? styles.inputError : ''}`}
                                    placeholder="e.g. citizen@example.com"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: undefined })); }}
                                    autoComplete="email"
                                    aria-label="Email address"
                                    disabled={isLoading}
                                />
                                {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="login-password" className={styles.formLabel}>Password</label>
                                <div className={styles.passwordWrapper}>
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        className={`${styles.formInput} ${fieldErrors.password ? styles.inputError : ''}`}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: undefined })); }}
                                        autoComplete="current-password"
                                        aria-label="Password"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        className={styles.passwordToggle}
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {fieldErrors.password && <span className={styles.fieldError}>{fieldErrors.password}</span>}
                            </div>

                            <div className={styles.formLinks}>
                                <button type="button" className={styles.formLink} onClick={() => navigate('/register', { state: location.state })}>
                                    Forgot Password?
                                </button>
                            </div>

                            <button type="submit" className={styles.ctaButton} disabled={isLoading}>
                                {isLoading ? <Loader2 size={18} className={styles.spin} /> : <Mail size={18} />}
                                {isLoading ? 'Signing in...' : 'Login'}
                            </button>
                        </form>

                        <div className={styles.footer}>
                            <p>Don't have an account? <Link to="/register" state={location.state}>Register</Link></p>
                        </div>
                    </div>
                </div>

                <div className={styles.trackCard}>
                    <h3><Search size={16} /> Track Report Without Login</h3>
                    <div className={styles.trackRow}>
                        <input
                            type="text"
                            className={styles.formInput}
                            placeholder="Enter reference number"
                            value={trackingId}
                            onChange={(e) => setTrackingId(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleTrackReport(); }}
                            aria-label="Report reference number"
                        />
                        <button type="button" className={styles.trackButton} onClick={handleTrackReport}>
                            Track
                        </button>
                    </div>
                    <p className={styles.trackHelper}>Enter the tracking ID you received when submitting a report.</p>
                </div>
            </div>
        </div>
    );
};
