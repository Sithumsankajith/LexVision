import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { AlertCircle, Smartphone, ShieldCheck, TriangleAlert, Shield, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { auth, type CitizenOtpReadiness } from '@lexvision/api-client';
import { CitizenOtpLoginModal, type CitizenOtpVerificationResult } from '@/components/CitizenOtpLoginModal';
import styles from './Login.module.css';

interface AuthRedirectState {
    from?: {
        pathname?: string;
        state?: unknown;
    };
    intent?: 'final-report-submit';
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [otpReadiness, setOtpReadiness] = useState<CitizenOtpReadiness | null>(null);
    const [readinessError, setReadinessError] = useState<string | null>(null);
    const [showReadiness, setShowReadiness] = useState(false);

    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const fromPath = navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const isFinalSubmitLogin = navigationState?.intent === 'final-report-submit';

    React.useEffect(() => {
        if (auth.isCitizenAuthenticated()) {
            navigate(fromPath, { replace: true, state: fromState });
            return;
        }

        if (isFinalSubmitLogin) {
            setIsOtpModalOpen(true);
        }
    }, [fromPath, fromState, isFinalSubmitLogin, navigate]);

    React.useEffect(() => {
        let isMounted = true;

        auth.getCitizenOtpReadiness()
            .then((readiness) => {
                if (isMounted) {
                    setOtpReadiness(readiness);
                }
            })
            .catch((loadError: unknown) => {
                if (isMounted) {
                    setReadinessError(getErrorMessage(loadError, 'Unable to load OTP readiness details.'));
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleOtpVerified = async (result: CitizenOtpVerificationResult) => {
        setError(null);
        setIsLoading(true);

        try {
            await auth.loginCitizenWithFirebaseToken(result.idToken, { persistSession: true });
            navigate(fromPath, { replace: true, state: fromState });
        } catch (verificationError: unknown) {
            const message = getErrorMessage(verificationError, 'Phone verification succeeded, but we could not create your citizen session.');
            setError(message);
            throw new Error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.loginPage}>
            {/* ── Left: Branding Panel ── */}
            <div className={styles.brandPanel}>
                <div className={styles.decorShape1} />
                <div className={styles.decorShape2} />

                <div className={styles.brandInner}>
                    <div className={styles.shieldIcon}>
                        <Shield size={28} color="#fff" />
                    </div>
                    <div className={styles.brandTitle}>LexVision</div>
                    <div className={styles.brandTagline}>
                        Road Safety,<br />Powered by Citizens
                    </div>

                    <div className={styles.trustBadges}>
                        <div className={styles.trustItem}>
                            <span className={styles.trustDot} />
                            <span>AI-powered evidence verification</span>
                        </div>
                        <div className={styles.trustItem}>
                            <span className={styles.trustDot} />
                            <span>Secure & encrypted citizen data</span>
                        </div>
                        <div className={styles.trustItem}>
                            <span className={styles.trustDot} />
                            <span>Validated by Sri Lanka Traffic Police</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Right: Login Form Panel ── */}
            <div className={styles.formPanel}>
                <div className={styles.formCard}>
                    {/* Phone illustration */}
                    <div className={styles.phoneIllustration}>
                        <div className={styles.phoneFrame}>
                            <div className={styles.phoneNotch} />
                            <div className={styles.phoneCheckmark}>
                                <Check size={16} strokeWidth={3} />
                            </div>
                            <div className={styles.phoneOtpDots}>
                                <div className={styles.otpDot}>1</div>
                                <div className={styles.otpDot}>2</div>
                                <div className={styles.otpDot}>3</div>
                                <div className={styles.otpDot}>5</div>
                            </div>
                        </div>
                    </div>

                    {/* Header */}
                    <div className={styles.formHeader}>
                        <h1>Citizen Portal</h1>
                        <p>
                            {isFinalSubmitLogin
                                ? 'Verify your phone to continue with the saved report submission.'
                                : 'Verify your phone number to access the reports linked to your citizen account.'}
                        </p>
                    </div>

                    {/* Error banner */}
                    {error && (
                        <div className={styles.errorBox}>
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* CTA Button */}
                    <button
                        type="button"
                        className={styles.ctaButton}
                        onClick={() => setIsOtpModalOpen(true)}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Loader2 size={18} className={styles.spin} />
                        ) : (
                            <Smartphone size={18} />
                        )}
                        {isLoading ? 'Verifying...' : 'Verify With Phone OTP'}
                    </button>

                    <p className={styles.helperText}>
                        Use the same mobile number you used during report submission. After OTP verification, LexVision will create your citizen session.
                    </p>

                    {/* Divider */}
                    <div className={styles.divider}>
                        <div className={styles.dividerLine} />
                        <span className={styles.dividerLabel}>Status</span>
                        <div className={styles.dividerLine} />
                    </div>

                    {/* Readiness card - collapsible */}
                    <div className={styles.readinessCard}>
                        <button
                            type="button"
                            className={styles.readinessToggle}
                            onClick={() => setShowReadiness(!showReadiness)}
                        >
                            <div className={styles.readinessHeader}>
                                {otpReadiness?.backend_configured ? (
                                    <ShieldCheck size={16} className={styles.readinessSuccessIcon} />
                                ) : (
                                    <TriangleAlert size={16} className={styles.readinessWarningIcon} />
                                )}
                                <h2>OTP Requirements</h2>
                            </div>
                            {showReadiness ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {showReadiness && (
                            <div className={styles.readinessBody}>
                                {readinessError ? (
                                    <p className={styles.readinessError}>{readinessError}</p>
                                ) : otpReadiness ? (
                                    <>
                                        <p className={styles.readinessSummary}>
                                            Backend Firebase Admin: <strong>{otpReadiness.backend_configured ? 'Configured' : 'Not configured'}</strong>
                                            {otpReadiness.firebase_project_id ? ` for ${otpReadiness.firebase_project_id}` : ''}
                                        </p>

                                        {!otpReadiness.backend_configured && otpReadiness.missing_backend_env.length > 0 && (
                                            <p className={styles.readinessError}>
                                                Missing backend env: {otpReadiness.missing_backend_env.join(', ')}
                                            </p>
                                        )}

                                        <ul className={styles.requirementsList}>
                                            {otpReadiness.requirements.map((requirement) => (
                                                <li key={requirement}>{requirement}</li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <p className={styles.readinessSummary}>Loading OTP readiness details...</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className={styles.footer}>
                        <p>Need to check a report without signing in? <Link to="/portal/track">Track by reference number</Link></p>
                    </div>
                </div>
            </div>

            <CitizenOtpLoginModal
                isOpen={isOtpModalOpen}
                onClose={() => setIsOtpModalOpen(false)}
                onVerified={handleOtpVerified}
                description={
                    isFinalSubmitLogin
                        ? 'Complete Firebase phone verification here to continue with your saved evidence submission.'
                        : 'Verify your phone number to open your citizen reports linked to this mobile account.'
                }
            />
        </div>
    );
};
