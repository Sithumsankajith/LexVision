const SESSION_KEY = 'lexvision_user_session';
const CITIZEN_SESSION_KEY = 'lexvision_citizen_session';
const readApiBaseUrl = (): string => {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const configuredUrl = env?.VITE_API_BASE_URL?.trim();
    const baseUrl = configuredUrl || 'http://localhost:8000/api';
    return baseUrl.replace(/\/+$/, '');
};

export const API_BASE_URL = readApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.endsWith('/api')
    ? API_BASE_URL.slice(0, -4)
    : API_BASE_URL.replace(/\/api\/?$/, '');
const DEMO_FIREBASE_UID_PREFIX = 'demo-otp:';

type CitizenAuthProvider = 'firebase' | 'demo';

export interface UserSession {
    id: string;
    role: 'ADMIN' | 'POLICE' | 'CITIZEN';
    email: string;
    token: string;
}

export interface CitizenSession {
    id: string;
    role: 'CITIZEN';
    phone_number: string;
    token: string;
    auth_provider: CitizenAuthProvider;
    firebase_uid?: string;
    verified_at?: string;
    created_at?: string;
}

export type CitizenPortalAuthMode = 'phone' | 'email' | null;

export interface CitizenIdentity {
    id: string;
    role: 'CITIZEN';
    phone_number: string;
}

export interface CitizenBackendIdentity {
    id: string;
    firebase_uid: string;
    phone_number: string;
    verified_at: string;
    created_at: string;
}

export interface CitizenTokenExchange {
    access_token: string;
    token_type: string;
    user?: CitizenIdentity;
    citizen?: CitizenBackendIdentity;
}

export interface CitizenOtpReadiness {
    backend_configured: boolean;
    admin_configured: boolean;
    dev_mode_enabled: boolean;
    verification_mode: string;
    firebase_project_id: string | null;
    missing_backend_env: string[];
    requirements: string[];
}

interface CitizenLoginOptions {
    persistSession?: boolean;
}

const getCitizenIdentity = (exchange: CitizenTokenExchange): CitizenIdentity => {
    if (exchange.user) {
        return exchange.user;
    }

    if (exchange.citizen) {
        return {
            id: exchange.citizen.id,
            role: 'CITIZEN',
            phone_number: exchange.citizen.phone_number,
        };
    }

    throw new Error('Citizen login response is missing user details.');
};

const buildCitizenSession = (
    exchange: CitizenTokenExchange,
    provider: CitizenAuthProvider,
): CitizenSession => {
    const user = getCitizenIdentity(exchange);

    return {
        id: user.id,
        role: 'CITIZEN',
        phone_number: user.phone_number,
        token: exchange.access_token,
        auth_provider: provider,
        firebase_uid: exchange.citizen?.firebase_uid,
        verified_at: exchange.citizen?.verified_at,
        created_at: exchange.citizen?.created_at,
    };
};

export const auth = {
    /**
     * Authenticates a user with the backend API.
     */
    login: async (email: string, password: string): Promise<UserSession> => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Invalid email or password.');
        }

        const data = await response.json();

        const profileRes = await fetch(`${API_BASE_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${data.access_token}` },
        });

        if (!profileRes.ok) {
            throw new Error('Failed to retrieve user profile after login.');
        }

        const profileData = await profileRes.json();
        const user = profileData.user;
        const requestedStaffPortal =
            typeof window !== 'undefined' &&
            (window.location.port === '5174' || window.location.port === '5175');

        if (requestedStaffPortal && !['POLICE', 'ADMIN'].includes(user.role)) {
            throw new Error('This account is not authorized for staff dashboard access.');
        }

        const session: UserSession = {
            id: user.id,
            role: user.role,
            email: user.email,
            token: data.access_token,
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    },

    /**
     * Registers a new user with the backend API.
     */
    register: async (email: string, password: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Registration failed. Email might already be in use.');
        }
    },

    /**
     * Exchanges a Firebase citizen ID token for a LexVision backend citizen token.
     * This does not persist a global portal session unless requested.
     */
    loginCitizenWithFirebaseToken: async (
        idToken: string,
        phoneNumber: string,
        options: CitizenLoginOptions = {},
    ): Promise<CitizenTokenExchange> => {
        const response = await fetch(`${API_BASE_URL}/auth/firebase-phone-login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firebase_id_token: idToken,
                phone_number: phoneNumber.trim(),
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                throw new Error(errorData.detail || 'The backend could not verify this OTP session. Request a new OTP and try again.');
            }
            if (response.status === 503) {
                throw new Error(errorData.detail || 'Citizen phone verification is temporarily unavailable. Please try again shortly.');
            }
            if (response.status === 409) {
                throw new Error(errorData.detail || 'This verified phone number conflicts with an existing citizen account.');
            }
            throw new Error(errorData.detail || 'Citizen backend verification failed.');
        }

        const exchange = await response.json();
        if (options.persistSession) {
            auth.setCitizenSession(exchange, 'firebase');
        }
        return exchange;
    },

    getCitizenOtpReadiness: async (): Promise<CitizenOtpReadiness> => {
        const response = await fetch(`${API_BASE_URL}/auth/citizen/otp-readiness`);

        if (!response.ok) {
            throw new Error('Unable to load citizen OTP readiness details.');
        }

        return response.json();
    },

    setCitizenSession: (
        exchange: CitizenTokenExchange,
        provider: CitizenAuthProvider = 'firebase',
    ): CitizenSession => {
        const session = buildCitizenSession(exchange, provider);
        localStorage.setItem(CITIZEN_SESSION_KEY, JSON.stringify(session));
        return session;
    },

    /**
     * Temporary development/demo-only citizen login path.
     * The backend must explicitly enable this route, and it must never be used in production.
     */
    loginCitizenWithDemoOtp: async (
        phoneNumber: string,
        options: CitizenLoginOptions = {},
    ): Promise<CitizenTokenExchange> => {
        const response = await fetch(`${API_BASE_URL}/auth/citizen/demo-login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: phoneNumber.trim() }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 404) {
                throw new Error(errorData.detail || 'Demo citizen OTP login is disabled for this backend environment.');
            }
            throw new Error(errorData.detail || 'Demo citizen session creation failed.');
        }

        const exchange = await response.json();
        if (options.persistSession) {
            auth.setCitizenSession(exchange, 'demo');
        }
        return exchange;
    },

    getCitizenSession: (): CitizenSession | null => {
        try {
            const data = localStorage.getItem(CITIZEN_SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    logoutCitizen: () => {
        localStorage.removeItem(CITIZEN_SESSION_KEY);
        void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    },

    /**
     * Retrieves the current active session.
     */
    getSession: (): UserSession | null => {
        try {
            const data = localStorage.getItem(SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    /**
     * Clears the current session.
     */
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
        void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    },

    /**
     * Generic auth guard check
     */
    isAuthenticated: (): boolean => {
        return auth.getSession() !== null;
    },

    isCitizenAuthenticated: (): boolean => {
        return auth.getCitizenSession() !== null;
    },

    getCitizenPortalAuthMode: (): CitizenPortalAuthMode => {
        if (auth.getCitizenSession()) {
            return 'phone';
        }

        const session = auth.getSession();
        if (session?.role === 'CITIZEN') {
            return 'email';
        }

        return null;
    },

    hasCitizenPortalAccess: (): boolean => {
        return auth.getCitizenPortalAuthMode() !== null;
    },

    isDemoCitizenSession: (session: CitizenSession | null = auth.getCitizenSession()): boolean => {
        return Boolean(session && (session.auth_provider === 'demo' || session.firebase_uid?.startsWith(DEMO_FIREBASE_UID_PREFIX)));
    },

    isClientOnlyDemoCitizenSession: (session: CitizenSession | null = auth.getCitizenSession()): boolean => {
        return Boolean(
            session &&
            (session.auth_provider === 'demo' || session.firebase_uid?.startsWith(DEMO_FIREBASE_UID_PREFIX)) &&
            session.token.endsWith('.demo'),
        );
    },
};
