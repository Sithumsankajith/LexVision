import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, MessageSquareLock, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { Button, Card, Input } from '@lexvision/ui';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { ensureFirebaseAuthReady, getFirebaseAuth } from '@/lib/firebase';
import styles from './CitizenOtpLoginModal.module.css';

export interface CitizenOtpVerificationResult {
    idToken: string;
    phoneNumber: string;
    uid: string;
}

interface CitizenOtpLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified: (result: CitizenOtpVerificationResult) => Promise<void> | void;
    title?: string;
    description?: string;
    initialPhoneNumber?: string;
}

const DEFAULT_PHONE_PREFIX = '+94';
const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizePhoneNumber = (value: string) => value.replace(/[^\d+]/g, '');

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallback;
};

export const CitizenOtpLoginModal: React.FC<CitizenOtpLoginModalProps> = ({
    isOpen,
    onClose,
    onVerified,
    title = 'Verify Your Phone Number',
    description = 'Enter a mobile number in international format to receive a one-time password from Firebase Authentication.',
    initialPhoneNumber = DEFAULT_PHONE_PREFIX,
}) => {
    const recaptchaContainerRef = useRef<HTMLDivElement>(null);
    const verifierRef = useRef<RecaptchaVerifier | null>(null);
    const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
    const [otpCode, setOtpCode] = useState('');
    const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

        // Firebase phone auth on web requires a live reCAPTCHA challenge before OTP can be sent.
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
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
            teardownRecaptcha();
        };
    }, [initialPhoneNumber, isOpen, onClose, resetFlow, teardownRecaptcha]);

    if (!isOpen) {
        return null;
    }

    const handleSendOtp = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
        if (!E164_PHONE_REGEX.test(normalizedPhoneNumber)) {
            setErrorMessage('Enter a valid phone number in international format, for example +94771234567.');
            return;
        }

        setIsSendingOtp(true);

        try {
            const verifier = await ensureRecaptchaVerifier();
            const auth = await ensureFirebaseAuthReady();
            const result = await signInWithPhoneNumber(auth, normalizedPhoneNumber, verifier);

            setPhoneNumber(normalizedPhoneNumber);
            setConfirmationResult(result);
            setStatusMessage(`An OTP has been sent to ${normalizedPhoneNumber}. Enter it below to continue.`);
        } catch (error: unknown) {
            setErrorMessage(getErrorMessage(error, 'Unable to send the OTP right now. Please try again.'));
            teardownRecaptcha();
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleVerifyOtp = async (event: React.FormEvent) => {
        event.preventDefault();
        setErrorMessage(null);
        setStatusMessage(null);

        if (!confirmationResult) {
            setErrorMessage('Send an OTP first before entering the verification code.');
            return;
        }

        if (!otpCode.trim() || otpCode.trim().length < 6) {
            setErrorMessage('Enter the 6-digit OTP you received.');
            return;
        }

        setIsVerifyingOtp(true);

        try {
            const credential = await confirmationResult.confirm(otpCode.trim());
            const idToken = await credential.user.getIdToken();
            const verifiedPhoneNumber = credential.user.phoneNumber || phoneNumber;

            // Return the Firebase ID token so later work can exchange it with the backend.
            await onVerified({
                idToken,
                phoneNumber: verifiedPhoneNumber,
                uid: credential.user.uid,
            });

            onClose();
        } catch (error: unknown) {
            setErrorMessage(getErrorMessage(error, 'OTP verification failed. Check the code and try again.'));
        } finally {
            setIsVerifyingOtp(false);
        }
    };

    const handleRequestNewCode = () => {
        setOtpCode('');
        setConfirmationResult(null);
        setStatusMessage(null);
        setErrorMessage(null);
        teardownRecaptcha();
    };

    return (
        <div className={styles.overlay} role="presentation" onClick={onClose}>
            <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="citizen-otp-title" onClick={(event) => event.stopPropagation()}>
                <Card padding="lg">
                    <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close phone verification">
                        <X size={18} />
                    </button>

                    <div className={styles.header}>
                        <div className={styles.eyebrow}>
                            <ShieldCheck size={16} />
                            <span>Citizen Verification</span>
                        </div>
                        <h2 id="citizen-otp-title" className={styles.title}>{title}</h2>
                        <p className={styles.description}>{description}</p>
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
                            Use an international phone number such as <strong>+94771234567</strong>. Firebase will send the OTP directly to that number.
                        </div>

                        {!confirmationResult ? (
                            <form className={styles.form} onSubmit={handleSendOtp}>
                                <Input
                                    id="citizen-otp-phone"
                                    label="Phone Number"
                                    placeholder="+94771234567"
                                    value={phoneNumber}
                                    onChange={(event) => setPhoneNumber(normalizePhoneNumber(event.target.value))}
                                    autoComplete="tel"
                                    fullWidth
                                    required
                                />
                                <p className={styles.hint}>Firebase phone auth expects E.164 format with the country code.</p>

                                <div className={styles.recaptchaShell}>
                                    <label className={styles.recaptchaLabel}>Security Check</label>
                                    <div ref={recaptchaContainerRef} className={styles.recaptchaMount} />
                                </div>

                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" onClick={onClose} fullWidth>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="primary" isLoading={isSendingOtp} leftIcon={<MessageSquareLock size={16} />} fullWidth>
                                        Send OTP
                                    </Button>
                                </div>
                            </form>
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
                                />

                                <div className={styles.secondaryActions}>
                                    <Button type="button" variant="ghost" size="sm" leftIcon={<RefreshCcw size={14} />} onClick={handleRequestNewCode}>
                                        Request a new code
                                    </Button>
                                </div>

                                <div className={styles.actions}>
                                    <Button type="button" variant="secondary" onClick={onClose} fullWidth>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="primary" isLoading={isVerifyingOtp} fullWidth>
                                        Verify OTP
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
