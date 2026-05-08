import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquareLock, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { Button, Card, Input } from '@lexvision/ui';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
    ensureFirebaseAuthReady,
    getFirebaseAuth,
    getFirebaseConfigErrorMessage,
    isFirebaseConfigError,
} from '@/lib/firebase';
import {
    buildDemoFirebaseUid,
    buildDemoIdToken,
    getDemoOtpCode,
    isDemoOtpEnabled,
    validateDemoOtp,
} from '@/lib/demoOtp';
import { normalizeSriLankanPhone } from '@/lib/phone';
import styles from './CitizenOtpLoginModal.module.css';

export interface CitizenOtpVerificationResult {
    idToken: string;
    phoneNumber: string;
    uid: string;
    provider: 'firebase' | 'demo';
}

interface CitizenOtpLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified: (result: CitizenOtpVerificationResult) => Promise<void> | void;
    title?: string;
    description?: string;
    initialPhoneNumber?: string;
    enableDemoOtp?: boolean;
}

const DEFAULT_PHONE_PREFIX = '+94';
const RESEND_TIMEOUT_SECONDS = 30;

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallback;
};

const getOtpErrorMessage = (error: unknown) => {
    if (error instanceof FirebaseError) {
        switch (error.code) {
            case 'auth/invalid-verification-code':
                return 'Verification failed. Please check the code.';
            case 'auth/code-expired':
                return 'OTP expired. Request a new code and try again.';
            case 'auth/too-many-requests':
                return 'Too many attempts. Try again later.';
            default:
                return getErrorMessage(error, 'Verification failed. Please check the code.');
        }
    }

    return getErrorMessage(error, 'Verification failed. Please check the code.');
};

const getSubmitErrorMessage = (error: unknown) => {
    const fallback = 'Your phone number was verified, but the final secure step failed. Please try again.';
    return getErrorMessage(error, fallback);
};

const getSendOtpErrorMessage = (error: unknown) => {
    if (isFirebaseConfigError(error)) {
        return getFirebaseConfigErrorMessage(error);
    }

    if (error instanceof FirebaseError) {
        switch (error.code) {
            case 'auth/app-not-authorized':
            case 'auth/unauthorized-domain':
                return 'This domain is not authorized for Firebase phone sign-in. Add your current domain, such as localhost, in Firebase Authentication Authorized domains.';
            case 'auth/captcha-check-failed':
                return 'Please complete reCAPTCHA verification.';
            case 'auth/invalid-phone-number':
                return 'Enter a valid Sri Lankan mobile number, for example 0712345678 or +94712345678.';
            case 'auth/invalid-api-key':
                return 'The Firebase web configuration is invalid. Check the VITE_FIREBASE_* values in apps/citizen-portal/.env.local.';
            case 'auth/operation-not-allowed':
                return 'Firebase Phone Authentication is not enabled for this project. Enable the Phone provider in Firebase Authentication.';
            case 'auth/quota-exceeded':
                return 'Firebase could not send the OTP because the SMS quota or billing requirement has been hit. Move the project to Blaze, allow Sri Lanka in SMS regions, and try again later.';
            case 'auth/network-request-failed':
                return 'The OTP request could not reach Firebase. Check your internet connection and browser network access.';
            case 'auth/too-many-requests':
                return 'Too many attempts. Try again later.';
            default:
                return getErrorMessage(error, 'Unable to send the OTP right now. Please try again.');
        }
    }

    return getErrorMessage(error, 'Unable to send the OTP right now. Please try again.');
};

export const CitizenOtpLoginModal: React.FC<CitizenOtpLoginModalProps> = ({
    isOpen,
    onClose,
    onVerified,
    title = 'Verify Your Phone Number',
    description = 'Enter your Sri Lankan mobile number to receive a one-time password from Firebase Authentication.',
    initialPhoneNumber = DEFAULT_PHONE_PREFIX,
    enableDemoOtp = false,
}) => {
    const recaptchaContainerRef = useRef<HTMLDivElement>(null);
    const verifierRef = useRef<RecaptchaVerifier | null>(null);
    const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
    const [otpCode, setOtpCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [isDemoOtpStepReady, setIsDemoOtpStepReady] = useState(false);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [isCompletingSubmit, setIsCompletingSubmit] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);
    const [verifiedResult, setVerifiedResult] = useState<CitizenOtpVerificationResult | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const demoOtpEnabled = enableDemoOtp && isDemoOtpEnabled();
    const isBusy = isSendingOtp || isVerifyingOtp || isCompletingSubmit;
    const currentStep = verifiedResult ? 3 : (confirmationResult || isDemoOtpStepReady) ? 2 : 1;

    const teardownRecaptcha = useCallback(() => {
        verifierRef.current?.clear();
        verifierRef.current = null;

        if (recaptchaContainerRef.current) {
            recaptchaContainerRef.current.innerHTML = '';
        }
    }, []);

    const resetFlow = useCallback(() => {
        setOtpCode('');
        setConfirmationResult(null);
        setIsDemoOtpStepReady(false);
        setVerifiedResult(null);
        setResendCountdown(0);
        setStatusMessage(null);
        setErrorMessage(null);
    }, []);

    const ensureRecaptchaVerifier = useCallback(async () => {
        await ensureFirebaseAuthReady();

        if (verifierRef.current) {
            return verifierRef.current;
        }

        if (!recaptchaContainerRef.current) {
            throw new Error('reCAPTCHA is not ready yet. Please reopen the verification dialog.');
        }

        const verifier = new RecaptchaVerifier(getFirebaseAuth(), recaptchaContainerRef.current, {
            size: 'normal',
            callback: () => {
                setErrorMessage(null);
            },
        });

        await verifier.render();
        verifierRef.current = verifier;
        return verifier;
    }, []);

    useEffect(() => {
        if (!isOpen) {
            teardownRecaptcha();
            resetFlow();
            return;
        }

        setPhoneNumber(initialPhoneNumber);

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isBusy) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
            teardownRecaptcha();
        };
    }, [initialPhoneNumber, isBusy, isOpen, onClose, resetFlow, teardownRecaptcha]);

    useEffect(() => {
        if (!isOpen || resendCountdown <= 0) {
            return;
        }

        const timerId = window.setTimeout(() => {
            setResendCountdown((current) => Math.max(0, current - 1));
        }, 1000);

        return () => window.clearTimeout(timerId);
    }, [isOpen, resendCountdown]);

    if (!isOpen) {
        return null;
    }

    const requestOtp = async (rawPhoneNumber: string, options: { resend?: boolean } = {}): Promise<boolean> => {
        setErrorMessage(null);
        setStatusMessage(null);

        let normalizedPhoneNumber = '';
        try {
            normalizedPhoneNumber = normalizeSriLankanPhone(rawPhoneNumber);
        } catch (error: unknown) {
            setErrorMessage(getErrorMessage(error, 'Enter a valid Sri Lankan mobile number.'));
            return false;
        }

        setStatusMessage(options.resend ? `Sending a new OTP to ${normalizedPhoneNumber}...` : `Sending OTP to ${normalizedPhoneNumber}...`);
        setIsSendingOtp(true);

        try {
            if (demoOtpEnabled) {
                setPhoneNumber(normalizedPhoneNumber);
                setOtpCode('');
                setConfirmationResult(null);
                setIsDemoOtpStepReady(true);
                setResendCountdown(RESEND_TIMEOUT_SECONDS);
                setStatusMessage(`OTP sent to ${normalizedPhoneNumber}. Demo mode is active, so use ${getDemoOtpCode()}.`);
                return true;
            }

            const verifier = await ensureRecaptchaVerifier();
            const firebaseAuth = await ensureFirebaseAuthReady();
            const result = await signInWithPhoneNumber(firebaseAuth, normalizedPhoneNumber, verifier);

            setPhoneNumber(normalizedPhoneNumber);
            setOtpCode('');
            setConfirmationResult(result);
            setIsDemoOtpStepReady(false);
            setResendCountdown(RESEND_TIMEOUT_SECONDS);
            setStatusMessage(`OTP sent to ${normalizedPhoneNumber}.`);
            return true;
        } catch (error: unknown) {
            setStatusMessage(null);
            setErrorMessage(getSendOtpErrorMessage(error));
            teardownRecaptcha();
            return false;
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleSendOtp = async (event: React.FormEvent) => {
        event.preventDefault();
        await requestOtp(phoneNumber);
    };

    const handleVerifyOtp = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        if (!confirmationResult && !isDemoOtpStepReady) {
            setErrorMessage('Send an OTP first before entering the verification code.');
            return;
        }

        const trimmedOtpCode = otpCode.trim();
        if (!trimmedOtpCode || trimmedOtpCode.length < 6) {
            setErrorMessage('Enter the 6-digit OTP you received.');
            return;
        }

        if (demoOtpEnabled && isDemoOtpStepReady && !validateDemoOtp(trimmedOtpCode)) {
            setErrorMessage(`Invalid demo OTP. Use ${getDemoOtpCode()}.`);
            return;
        }

        setStatusMessage('Verifying OTP...');
        setIsVerifyingOtp(true);

        try {
            let result: CitizenOtpVerificationResult;

            if (demoOtpEnabled && isDemoOtpStepReady) {
                result = {
                    idToken: buildDemoIdToken(phoneNumber),
                    phoneNumber,
                    uid: buildDemoFirebaseUid(phoneNumber),
                    provider: 'demo',
                };
            } else {
                if (!confirmationResult) {
                    throw new Error('Send an OTP first before entering the verification code.');
                }

                const credential = await confirmationResult.confirm(trimmedOtpCode);
                const idToken = await credential.user.getIdToken();
                const verifiedPhoneNumber = credential.user.phoneNumber || phoneNumber;
                result = {
                    idToken,
                    phoneNumber: verifiedPhoneNumber,
                    uid: credential.user.uid,
                    provider: 'firebase',
                };
            }

            setVerifiedResult(result);
            setStatusMessage('Success. Finalizing...');
            setIsCompletingSubmit(true);

            await onVerified(result);
            onClose();
        } catch (error: unknown) {
            const isFirebaseVerificationError = error instanceof FirebaseError;
            setErrorMessage(isFirebaseVerificationError ? getOtpErrorMessage(error) : getSubmitErrorMessage(error));
            if (!isFirebaseVerificationError) {
                setStatusMessage('Your phone number is still verified. You can retry the final step below.');
            }
        } finally {
            setIsVerifyingOtp(false);
            setIsCompletingSubmit(false);
        }
    };

    const handleRequestNewCode = () => {
        setOtpCode('');
        setConfirmationResult(null);
        setIsDemoOtpStepReady(false);
        setVerifiedResult(null);
        setResendCountdown(0);
        setStatusMessage(null);
        setErrorMessage(null);
        teardownRecaptcha();
    };

    const handleResendOtp = async () => {
        if (resendCountdown > 0 || isBusy) {
            return;
        }

        setOtpCode('');
        setConfirmationResult(null);
        setIsDemoOtpStepReady(false);
        setVerifiedResult(null);
        await requestOtp(phoneNumber, { resend: true });
    };

    const handleRetrySubmit = async () => {
        if (!verifiedResult) {
            setErrorMessage('Verify the OTP first before retrying the final step.');
            return;
        }

        setErrorMessage(null);
        setStatusMessage('Retrying the final secure step...');
        setIsCompletingSubmit(true);

        try {
            await onVerified(verifiedResult);
            onClose();
        } catch (error: unknown) {
            setErrorMessage(getSubmitErrorMessage(error));
            setStatusMessage('Your phone number is still verified. You can retry the final step below.');
        } finally {
            setIsCompletingSubmit(false);
        }
    };

    return (
        <div className={styles.overlay} role="presentation" onClick={() => { if (!isBusy) onClose(); }}>
            <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="citizen-otp-title" onClick={(event) => event.stopPropagation()}>
                <Card padding="lg">
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close phone verification" disabled={isBusy}>
                        <X size={18} />
                    </button>

                    <div className={styles.header}>
                        <div className={styles.eyebrow}>
                            <ShieldCheck size={16} />
                            <span>Citizen Verification</span>
                        </div>
                        {demoOtpEnabled && (
                            <div className={styles.demoBadge}>Demo mode: OTP is simulated</div>
                        )}
                        <h2 id="citizen-otp-title" className={styles.title}>{title}</h2>
                        <p className={styles.description}>{description}</p>
                    </div>

                    <div className={styles.stepRow} aria-label="Phone verification steps">
                        {[
                            { id: 1, label: 'Phone' },
                            { id: 2, label: 'OTP' },
                            { id: 3, label: 'Submit' },
                        ].map((step) => {
                            const isComplete = currentStep > step.id;
                            const isCurrent = currentStep === step.id;

                            return (
                                <div
                                    key={step.id}
                                    className={[
                                        styles.stepCard,
                                        isComplete ? styles.stepCardComplete : '',
                                        isCurrent ? styles.stepCardCurrent : '',
                                    ].filter(Boolean).join(' ')}
                                >
                                    <span className={styles.stepNumber}>{step.id}</span>
                                    <span className={styles.stepLabel}>{step.label}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.form}>
                        {errorMessage && (
                            <div className={styles.errorBox} role="alert">
                                <AlertCircle size={18} />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {statusMessage && (
                            <div className={styles.successBox}>
                                <CheckCircle2 size={18} />
                                <span>{statusMessage}</span>
                            </div>
                        )}

                        <div className={styles.infoBox}>
                            {demoOtpEnabled
                                ? <>Enter a Sri Lankan mobile number such as <strong>0712345678</strong> or <strong>+94712345678</strong>. No SMS will be sent in demo mode.</>
                                : <>Enter a Sri Lankan mobile number such as <strong>0712345678</strong> or <strong>+94712345678</strong>.</>
                            }
                        </div>

                        {!confirmationResult && !isDemoOtpStepReady ? (
                            <form className={styles.form} onSubmit={handleSendOtp}>
                                <Input
                                    id="citizen-otp-phone"
                                    label="Phone Number"
                                    placeholder="0712345678"
                                    value={phoneNumber}
                                    onChange={(event) => setPhoneNumber(event.target.value)}
                                    autoComplete="tel"
                                    fullWidth
                                    required
                                    disabled={isBusy}
                                />
                                <p className={styles.hint}>
                                    {demoOtpEnabled
                                        ? 'Demo mode will simulate OTP delivery for this number.'
                                        : 'We will send the OTP directly to this number.'
                                    }
                                </p>

                                {!demoOtpEnabled && (
                                    <div className={styles.recaptchaShell}>
                                        <label className={styles.recaptchaLabel}>Security Check</label>
                                        <div id="recaptcha-container" ref={recaptchaContainerRef} className={styles.recaptchaMount} />
                                    </div>
                                )}

                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" onClick={onClose} fullWidth disabled={isBusy}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="primary" isLoading={isSendingOtp} leftIcon={<MessageSquareLock size={16} />} fullWidth>
                                        {isSendingOtp ? 'Sending OTP...' : 'Send OTP'}
                                    </Button>
                                </div>
                            </form>
                        ) : verifiedResult ? (
                            <div className={styles.form}>
                                <div className={styles.successBox}>
                                    <CheckCircle2 size={18} />
                                    <span>Phone number verified for {verifiedResult.phoneNumber}. You can retry the final step if needed.</span>
                                </div>

                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" onClick={handleRequestNewCode} fullWidth disabled={isBusy}>
                                        Use Another OTP
                                    </Button>
                                    <Button type="button" variant="primary" onClick={handleRetrySubmit} isLoading={isCompletingSubmit} fullWidth>
                                        {isCompletingSubmit ? 'Finalizing...' : 'Retry Final Step'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <form className={styles.form} onSubmit={handleVerifyOtp}>
                                <Input
                                    id="citizen-otp-code"
                                    label="OTP Code"
                                    placeholder="Enter the 6-digit code"
                                    inputMode="numeric"
                                    value={otpCode}
                                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                    autoComplete="one-time-code"
                                    fullWidth
                                    required
                                    disabled={isBusy}
                                />

                                <div className={styles.secondaryActions}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleRequestNewCode}
                                    >
                                        Edit phone number
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        leftIcon={<RefreshCcw size={14} />}
                                        onClick={handleResendOtp}
                                        disabled={resendCountdown > 0 || isBusy}
                                    >
                                        {resendCountdown > 0 ? `Resend OTP in ${resendCountdown}s` : 'Resend OTP'}
                                    </Button>
                                </div>

                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" onClick={onClose} fullWidth disabled={isBusy}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="primary" isLoading={isVerifyingOtp || isCompletingSubmit} fullWidth>
                                        {isCompletingSubmit ? 'Finalizing...' : isVerifyingOtp ? 'Verifying OTP...' : 'Verify OTP'}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};
