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

const getRequiredEnv = (key: FirebaseEnvKey): string => {
    const value = import.meta.env[key];
    if (!value) {
        throw new Error(`Missing required Firebase environment variable: ${key}`);
    }
    return value;
};

export const firebaseConfig: FirebaseOptions = {
    apiKey: getRequiredEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getRequiredEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getRequiredEnv('VITE_FIREBASE_APP_ID'),
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

export const firebaseApp: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth: Auth = getAuth(firebaseApp);

let persistencePromise: Promise<void> | null = null;
let analyticsPromise: Promise<Analytics | null> | null = null;

export const ensureFirebaseAuthReady = async (): Promise<Auth> => {
    if (!persistencePromise) {
        persistencePromise = setPersistence(firebaseAuth, browserLocalPersistence).catch((error: unknown) => {
            persistencePromise = null;
            throw error;
        });
    }

    await persistencePromise;
    return firebaseAuth;
};

export const getFirebaseAnalyticsInstance = async (): Promise<Analytics | null> => {
    if (!firebaseConfig.measurementId || typeof window === 'undefined') {
        return null;
    }

    if (!analyticsPromise) {
        analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(firebaseApp) : null));
    }

    return analyticsPromise;
};
