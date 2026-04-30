const DEMO_OTP_CODE = '123456';
const DEMO_FIREBASE_UID_PREFIX = 'demo-otp:';

/**
 * Temporary local/demo-only OTP support.
 * This must remain disabled in production and should be removed once the real OTP flow is stable.
 */
export const isDemoOtpEnabled = (): boolean => {
    const demoFlagEnabled = import.meta.env.VITE_DEMO_OTP_ENABLED === 'true';
    const nonProductionMode = import.meta.env.DEV || import.meta.env.MODE === 'demo';
    return demoFlagEnabled && nonProductionMode;
};

export const getDemoOtpCode = (): string => DEMO_OTP_CODE;

export const validateDemoOtp = (otpCode: string): boolean =>
    isDemoOtpEnabled() && otpCode.trim() === DEMO_OTP_CODE;

export const buildDemoFirebaseUid = (phoneNumber: string): string =>
    `${DEMO_FIREBASE_UID_PREFIX}${phoneNumber.replace(/[^\d+]/g, '')}`;

export const isDemoFirebaseUid = (firebaseUid: string | null | undefined): boolean =>
    typeof firebaseUid === 'string' && firebaseUid.startsWith(DEMO_FIREBASE_UID_PREFIX);

export const buildDemoIdToken = (phoneNumber: string): string =>
    `demo-otp:${phoneNumber.replace(/[^\d+]/g, '')}`;
