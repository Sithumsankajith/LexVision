import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
    AlertCircle,
    Smartphone,
    ShieldCheck,
    TriangleAlert,
    Shield,
    Loader2,
    ChevronDown,
    ChevronUp,
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
import { auth, type CitizenOtpReadiness } from '@lexvision/api-client';
import { CitizenOtpLoginModal, type CitizenOtpVerificationResult } from '@/components/CitizenOtpLoginModal';
import { isDemoOtpEnabled } from '@/lib/demoOtp';
import styles from './Login.module.css';

/* ── Types ──────────────────────────────────────────────────── */
interface AuthRedirectState {
    from?: { pathname?: string; state?: unknown };
    intent?: 'final-report-submit';
}

type LoginTab = 'email' | 'phone';

interface EmailFormErrors {
    email?: string;
    password?: string;
}

/* ── Helpers ────────────────────────────────────────────────── */
const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
};

const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/* ── Component ──────────────────────────────────────────────── */
export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Navigation
    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const fromPath = navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const isFinalSubmitLogin = navigationState?.intent === 'final-report-submit';
    const demoOtpEnabled = isDemoOtpEnabled();

    // Shared UI state
    const [activeTab, setActiveTab] = useState<LoginTab>(isFinalSubmitLogin ? 'phone' : 'email');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Email form
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<EmailFormErrors>({});

    // Phone OTP
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [otpReadiness, setOtpReadiness] = useState<CitizenOtpReadiness | null>(null);
    const [readinessError, setReadinessError] = useState<string | null>(null);
    const [showReadiness, setShowReadiness] = useState(false);

    // Track report
    const [trackingId, setTrackingId] = useState('');

    /* ── Effects ─────────────────────────────────────────────── */
    React.useEffect(() => {
        if (auth.isCitizenAuthenticated()) {
            navigate(auth.isDemoCitizenSession() ? '/portal' : fromPath, { replace: true, state: fromState });
            return;
        }
        if (auth.isAuthenticated()) {
            const session = auth.getSession();
            if (session) {
                redirectByRole(session.role);
                return;
            }
        }
        if (isFinalSubmitLogin) {
            setActiveTab('phone');
            setIsOtpModalOpen(true);
        }
    }, [fromPath, fromState, isFinalSubmitLogin, navigate]);

    React.useEffect(() => {
        if (demoOtpEnabled) {
            setOtpReadiness(null);
            setReadinessError(null);
            return;
        }

        let mounted = true;
        auth.getCitizenOtpReadiness()
            .then((r) => { if (mounted) setOtpReadiness(r); })
            .catch((e: unknown) => { if (mounted) setReadinessError(getErrorMessage(e, 'Unable to load OTP readiness.')); });
        return () => { mounted = false; };
    }, [demoOtpEnabled]);

    /* ── Handlers ────────────────────────────────────────────── */
    const redirectByRole = (role: string) => {
        switch (role) {
            case 'ADMIN':
                window.location.href = 'http://localhost:5175';
                break;
            case 'POLICE':
                window.location.href = 'http://localhost:5174/dashboard';
                break;
            default:
                navigate('/portal', { replace: true });
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate
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

    const handleOtpVerified = async (result: CitizenOtpVerificationResult) => {
        setError(null);
        setIsLoading(true);
        try {
            if (result.provider === 'demo') {
                await auth.loginCitizenWithDemoOtp(result.phoneNumber, { persistSession: true });
                navigate('/portal', { replace: true });
                return;
            }

            await auth.loginCitizenWithFirebaseToken(result.idToken, result.phoneNumber, { persistSession: true });
            navigate(fromPath, { replace: true, state: fromState });
        } catch (err: unknown) {
            const msg = getErrorMessage(err, 'Phone verified but session creation failed.');
            setError(msg);
            throw new Error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTrackReport = () => {
        if (trackingId.trim()) {
            navigate(`/portal/track?id=${encodeURIComponent(trackingId.trim())}`);
        }
    };

    const switchTab = (tab: LoginTab) => {
        setActiveTab(tab);
        setError(null);
        setFieldErrors({});
    };

    const otpBackendLabel = demoOtpEnabled
        ? 'Demo mode'
        : otpReadiness?.verification_mode === 'admin'
            ? 'Configured (Firebase Admin)'
            : otpReadiness?.verification_mode === 'dev'
                ? 'Configured (Development fallback)'
                : 'Not configured';

    /* ── Render ──────────────────────────────────────────────── */
    return (
        <div className={styles.loginPage}>
            {/* ════════ Left: Branding Panel ════════ */}
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

            {/* ════════ Right: Form Panel ════════ */}
            <div className={styles.formPanel}>
                <div className={styles.formCard}>
                    {/* Header */}
                    <div className={styles.formHeader}>
                        <h1>Welcome Back</h1>
                        <p>Sign in to access the LexVision Citizen Portal</p>
                    </div>

                    {/* Tab Bar */}
                    <div className={styles.tabBar}>
                        <button
                            type="button"
                            className={`${styles.tabButton} ${activeTab === 'email' ? styles.tabButtonActive : ''}`}
                            onClick={() => switchTab('email')}
                        >
                            <Mail size={15} /> Email Login
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabButton} ${activeTab === 'phone' ? styles.tabButtonActive : ''}`}
                            onClick={() => switchTab('phone')}
                        >
                            <Smartphone size={15} /> Phone OTP
                        </button>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className={styles.errorBox}>
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* ── Email Tab ──────────────────────────────── */}
                    {activeTab === 'email' && (
                        <div className={styles.tabContent} key="email-tab">
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
                    )}

                    {/* ── Phone OTP Tab ──────────────────────────── */}
                    {activeTab === 'phone' && (
                        <div className={styles.tabContent} key="phone-tab">
                            {demoOtpEnabled && (
                                <div className={styles.demoBadge}>Demo mode: OTP is simulated</div>
                            )}

                            <button
                                type="button"
                                className={styles.ctaButton}
                                onClick={() => setIsOtpModalOpen(true)}
                                disabled={isLoading}
                            >
                                {isLoading ? <Loader2 size={18} className={styles.spin} /> : <Smartphone size={18} />}
                                {isLoading ? 'Verifying...' : 'Verify With Phone OTP'}
                            </button>

                            <p className={styles.helperText}>
                                Use the same Sri Lankan mobile number you used during report submission. You can enter it as 0712345678 or +94712345678.
                            </p>

                            {/* Collapsible OTP readiness */}
                            <div className={styles.readinessCard}>
                                <button
                                    type="button"
                                    className={styles.readinessToggle}
                                    onClick={() => setShowReadiness(!showReadiness)}
                                >
                                    <div className={styles.readinessHeader}>
                                        {demoOtpEnabled || otpReadiness?.backend_configured ? (
                                            <ShieldCheck size={15} className={styles.readinessSuccessIcon} />
                                        ) : (
                                            <TriangleAlert size={15} className={styles.readinessWarningIcon} />
                                        )}
                                        <h2>OTP Requirements</h2>
                                    </div>
                                    {showReadiness ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                </button>

                                {showReadiness && (
                                    <div className={styles.readinessBody}>
                                        {demoOtpEnabled ? (
                                            <>
                                                <p className={styles.readinessSummary}>
                                                    Demo OTP is enabled for this local/demo build. No SMS provider will be contacted.
                                                </p>
                                                <ul className={styles.requirementsList}>
                                                    <li>Enter a valid E.164 mobile number, such as +94771234567.</li>
                                                    <li>Use the fixed demo code 123456 on the verification step.</li>
                                                    <li>This temporary login path must remain disabled in production.</li>
                                                </ul>
                                            </>
                                        ) : readinessError ? (
                                            <p className={styles.readinessError}>{readinessError}</p>
                                        ) : otpReadiness ? (
                                            <>
                                                <p className={styles.readinessSummary}>
                                                    Backend OTP verification: <strong>{otpBackendLabel}</strong>
                                                    {otpReadiness.firebase_project_id ? ` (${otpReadiness.firebase_project_id})` : ''}
                                                </p>
                                                {!otpReadiness.backend_configured && otpReadiness.missing_backend_env.length > 0 && (
                                                    <p className={styles.readinessError}>
                                                        Missing: {otpReadiness.missing_backend_env.join(', ')}
                                                    </p>
                                                )}
                                                <ul className={styles.requirementsList}>
                                                    {otpReadiness.requirements.map((r) => <li key={r}>{r}</li>)}
                                                </ul>
                                            </>
                                        ) : (
                                            <p className={styles.readinessSummary}>Loading readiness details...</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ════════ Track Report Card ════════ */}
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

            {/* OTP Modal */}
            <CitizenOtpLoginModal
                isOpen={isOtpModalOpen}
                onClose={() => setIsOtpModalOpen(false)}
                onVerified={handleOtpVerified}
                description={
                    isFinalSubmitLogin
                        ? 'Complete Firebase phone verification to continue with your saved evidence submission.'
                        : 'Verify your phone number to open your citizen reports.'
                }
                enableDemoOtp={demoOtpEnabled && !isFinalSubmitLogin}
            />
        </div>
    );
};
