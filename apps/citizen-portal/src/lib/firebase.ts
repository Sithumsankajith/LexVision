import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';

type FirebaseEnvKey =
    | 'VITE_FIREBASE_API_KEY'
    | 'VITE_FIREBASE_AUTH_DOMAIN'
    | 'VITE_FIREBASE_PROJECT_ID'
    | 'VITE_FIREBASE_STORAGE_BUCKET'
    | 'VITE_FIREBASE_MESSAGING_SENDER_ID'
    | 'VITE_FIREBASE_APP_ID';

const MISSING_FIREBASE_ENV_PREFIX = 'Missing required Firebase environment variable: ';

const readRequiredEnv = (key: FirebaseEnvKey): string => {
    const value = import.meta.env[key];
    if (!value) {
        throw new Error(`${MISSING_FIREBASE_ENV_PREFIX}${key}`);
    }
    return value;
};

let cachedConfig: FirebaseOptions | null = null;
let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let persistencePromise: Promise<void> | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;

export const isFirebaseConfigError = (error: unknown): error is Error =>
    error instanceof Error && error.message.startsWith(MISSING_FIREBASE_ENV_PREFIX);

export const getFirebaseConfigErrorMessage = (error: unknown): string => {
    if (!isFirebaseConfigError(error)) {
        return 'Citizen phone verification is not configured for this environment.';
    }

    const missingKey = error.message.replace(MISSING_FIREBASE_ENV_PREFIX, '');
    return `Citizen phone verification is not configured yet. Add ${missingKey} to apps/citizen-portal/.env.local and restart the citizen portal.`;
};

export const getFirebaseConfig = (): FirebaseOptions => {
    if (!cachedConfig) {
        cachedConfig = {
            apiKey: readRequiredEnv('VITE_FIREBASE_API_KEY'),
            authDomain: readRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
            projectId: readRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
            storageBucket: readRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
            messagingSenderId: readRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
            appId: readRequiredEnv('VITE_FIREBASE_APP_ID'),
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
        };
    }

    return cachedConfig;
};

export const getFirebaseApp = (): FirebaseApp => {
    if (!cachedApp) {
        const config = getFirebaseConfig();
        cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
    }

    return cachedApp;
};

export const getFirebaseAuth = (): Auth => {
    if (!cachedAuth) {
        cachedAuth = getAuth(getFirebaseApp());
    }

    return cachedAuth;
};

export const ensureFirebaseAuthReady = async (): Promise<Auth> => {
    const auth = getFirebaseAuth();

    if (!persistencePromise) {
        persistencePromise = setPersistence(auth, browserLocalPersistence).catch((error: unknown) => {
            persistencePromise = null;
            throw error;
        });
    }

    await persistencePromise;
    return auth;
};

export const getFirebaseAnalyticsInstance = async (): Promise<Analytics | null> => {
    const config = getFirebaseConfig();
    if (!config.measurementId || typeof window === 'undefined') {
        return null;
    }

    if (!analyticsPromise) {
        analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(getFirebaseApp()) : null));
    }

    return analyticsPromise;
};
