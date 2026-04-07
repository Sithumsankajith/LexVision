import type { ViolationType } from '@lexvision/types';

const DEFAULT_COORDINATES = {
    lat: 6.9271,
    lng: 79.8612,
};

const DB_NAME = 'lexvision-citizen-portal';
const STORE_NAME = 'report_drafts';
const DRAFT_KEY = 'citizen-report-submit';

export interface ReportFormData {
    violationType: ViolationType | '';
    date: string;
    time: string;
    location: string;
    city: string;
    lat: number;
    lng: number;
    description: string;
    vehiclePlate: string;
    vehicleType: string;
    evidenceFiles: File[];
}

export const getDefaultReportFormData = (): ReportFormData => {
    const now = new Date();

    return {
        violationType: '',
        date: now.toISOString().split('T')[0],
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        location: '',
        city: '',
        lat: DEFAULT_COORDINATES.lat,
        lng: DEFAULT_COORDINATES.lng,
        description: '',
        vehiclePlate: '',
        vehicleType: '',
        evidenceFiles: [],
    };
};

export const isDefaultReportCoordinates = (lat: number, lng: number) =>
    lat === DEFAULT_COORDINATES.lat && lng === DEFAULT_COORDINATES.lng;

const openDraftDatabase = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB is not available in this browser.'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, 1);

        request.onerror = () => reject(request.error ?? new Error('Failed to open the draft database.'));
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
};

const withStore = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error?: unknown) => void) => void,
): Promise<T> => {
    const database = await openDraftDatabase();

    return new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error('Draft storage transaction failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Draft storage transaction aborted.'));

        action(store, resolve, reject);
    });
};

export const savePendingReportDraft = async (draft: ReportFormData): Promise<void> => {
    await withStore<void>('readwrite', (store, resolve, reject) => {
        const request = store.put(draft, DRAFT_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to save the report draft.'));
    });
};

export const loadPendingReportDraft = async (): Promise<ReportFormData | null> => {
    return withStore<ReportFormData | null>('readonly', (store, resolve, reject) => {
        const request = store.get(DRAFT_KEY);
        request.onsuccess = () => resolve((request.result as ReportFormData | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error('Failed to load the report draft.'));
    });
};

export const clearPendingReportDraft = async (): Promise<void> => {
    await withStore<void>('readwrite', (store, resolve, reject) => {
        const request = store.delete(DRAFT_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to clear the report draft.'));
    });
};
