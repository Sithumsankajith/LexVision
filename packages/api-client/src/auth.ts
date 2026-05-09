const SESSION_KEY = 'lexvision_user_session';

const DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8000/api';

const normalizeApiBaseUrl = (value: string): string => {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) {
        return DEFAULT_LOCAL_API_BASE_URL;
    }
    return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
};

const readApiBaseUrl = (): string => {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const configuredUrl = env?.VITE_API_BASE_URL?.trim();
    return normalizeApiBaseUrl(configuredUrl || DEFAULT_LOCAL_API_BASE_URL);
};

export const API_BASE_URL = readApiBaseUrl();
export const API_ORIGIN = API_BASE_URL.endsWith('/api')
    ? API_BASE_URL.slice(0, -4)
    : API_BASE_URL.replace(/\/api\/?$/, '');
const extractErrorDetail = (errorData: unknown): string | null => {
    if (errorData && typeof errorData === 'object' && 'detail' in errorData) {
        const detail = (errorData as { detail?: unknown }).detail;
        if (typeof detail === 'string') {
            return detail;
        }
        if (Array.isArray(detail)) {
            return detail
                .map((entry) => {
                    if (entry && typeof entry === 'object' && 'msg' in entry) {
                        return String((entry as { msg: unknown }).msg);
                    }
                    return JSON.stringify(entry);
                })
                .join(', ');
        }
    }
    return null;
};

export const getApiErrorMessage = (error: unknown, fallback = 'Request failed.'): string => {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
        return `Backend server is not running or the request was blocked by CORS. Check that FastAPI is running at ${API_BASE_URL.replace(/\/api$/, '')} and that VITE_API_BASE_URL is correct.`;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

export const getResponseErrorMessage = async (response: Response, fallback = 'Request failed.'): Promise<string> => {
    const errorData = await response.json().catch(() => null);
    const detail = extractErrorDetail(errorData);

    if (response.status === 404) {
        return detail || `API endpoint not found at ${response.url}. Check the backend route and VITE_API_BASE_URL.`;
    }
    if (response.status === 401) {
        const lowerDetail = (detail || '').toLowerCase();
        if (lowerDetail.includes('not authenticated') || lowerDetail.includes('credentials')) {
            return detail || 'Session expired. Please sign in again.';
        }
        return detail || 'Invalid credentials.';
    }
    if (response.status === 403) {
        return detail || 'This account is not authorized for that dashboard.';
    }
    if (response.status >= 500) {
        return detail || 'Backend server returned an internal error. Check the FastAPI logs.';
    }
    return detail || fallback;
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
        return await fetch(input, init);
    } catch (error) {
        throw new Error(getApiErrorMessage(error));
    }
};

export interface UserSession {
    id: string;
    role: 'ADMIN' | 'POLICE' | 'CITIZEN';
    email: string;
    token: string;
}

export type CitizenPortalAuthMode = 'email' | null;

const parseJwtPayload = (token: string): { exp?: number } | null => {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
};

const isTokenValid = (token: string): boolean => {
    const payload = parseJwtPayload(token);
    if (!payload?.exp) return false;
    return payload.exp * 1000 > Date.now();
};

export const auth = {
    /**
     * Authenticates a user with the backend API.
     */
    login: async (email: string, password: string): Promise<UserSession> => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await apiFetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(await getResponseErrorMessage(response, 'Invalid credentials.'));
        }

        const data = await response.json();

        const profileRes = await apiFetch(`${API_BASE_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${data.access_token}` },
        });

        if (!profileRes.ok) {
            throw new Error(await getResponseErrorMessage(profileRes, 'Failed to retrieve user profile after login.'));
        }

        const profileData = await profileRes.json();
        const user = profileData.user;

        if (typeof window !== 'undefined' && window.location.port === '5175' && user.role !== 'ADMIN') {
            throw new Error('This account is not authorized for the admin dashboard.');
        }

        if (typeof window !== 'undefined' && window.location.port === '5174' && !['POLICE', 'ADMIN'].includes(user.role)) {
            throw new Error('This account is not authorized for police dashboard access.');
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
        const response = await apiFetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            throw new Error(await getResponseErrorMessage(response, 'Registration failed. Email might already be in use.'));
        }
    },

    /**
     * Retrieves the current active session.
     */
    getSession: (): UserSession | null => {
        try {
            const data = localStorage.getItem(SESSION_KEY);
            const session = data ? JSON.parse(data) as UserSession : null;
            if (!session?.token || !isTokenValid(session.token)) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return session;
        } catch {
            return null;
        }
    },

    /**
     * Clears the current session.
     */
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('lexvision_citizen_session');
        void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    },

    /**
     * Generic auth guard check
     */
    isAuthenticated: (): boolean => {
        return auth.getSession() !== null;
    },

    getCitizenPortalAuthMode: (): CitizenPortalAuthMode => {
        const session = auth.getSession();
        if (session?.role === 'CITIZEN') {
            return 'email';
        }

        return null;
    },

    hasCitizenPortalAccess: (): boolean => {
        return auth.getCitizenPortalAuthMode() !== null;
    },

    isCitizenAuthenticated: (): boolean => {
        return auth.hasCitizenPortalAccess();
    },
};
