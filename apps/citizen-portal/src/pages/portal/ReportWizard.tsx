import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Camera, MapPin, Radio, Upload, X, CheckCircle, FileText, ArrowRight, ArrowLeft, Locate, Loader2 } from 'lucide-react';
import { Stepper, Button, Card, Input, Select } from '@lexvision/ui';
import { auth, mockDb } from '@lexvision/api-client';
import { SRI_LANKA_DISTRICTS } from '@lexvision/types';
import type { ViolationType } from '@lexvision/types';
import {
    clearPendingReportDraft,
    getDefaultReportFormData,
    isDefaultReportCoordinates,
    loadPendingReportDraft,
    savePendingReportDraft,
    type ReportFormData,
} from '@/lib/reportDraft';
import styles from '@/pages/portal/ReportWizard.module.css';

const STEPS = [
    { id: 1, label: 'Violation Type' },
    { id: 2, label: 'Location & Time' },
    { id: 3, label: 'Evidence Details' },
    { id: 4, label: 'Vehicle Info' },
];

// --- Sri Lankan Cities/Towns (all 25 districts + major towns) ---
const SRI_LANKAN_CITIES = [
    { value: '', label: 'Select City / Town' },
    // Western Province
    { value: 'Colombo', label: 'Colombo' },
    { value: 'Dehiwala-Mount Lavinia', label: 'Dehiwala-Mount Lavinia' },
    { value: 'Moratuwa', label: 'Moratuwa' },
    { value: 'Negombo', label: 'Negombo' },
    { value: 'Sri Jayawardenepura Kotte', label: 'Sri Jayawardenepura Kotte' },
    { value: 'Gampaha', label: 'Gampaha' },
    { value: 'Kalutara', label: 'Kalutara' },
    { value: 'Panadura', label: 'Panadura' },
    // Central Province
    { value: 'Kandy', label: 'Kandy' },
    { value: 'Matale', label: 'Matale' },
    { value: 'Nuwara Eliya', label: 'Nuwara Eliya' },
    { value: 'Dambulla', label: 'Dambulla' },
    // Southern Province
    { value: 'Galle', label: 'Galle' },
    { value: 'Matara', label: 'Matara' },
    { value: 'Hambantota', label: 'Hambantota' },
    { value: 'Tangalle', label: 'Tangalle' },
    // Northern Province
    { value: 'Jaffna', label: 'Jaffna' },
    { value: 'Kilinochchi', label: 'Kilinochchi' },
    { value: 'Mannar', label: 'Mannar' },
    { value: 'Mullaitivu', label: 'Mullaitivu' },
    { value: 'Vavuniya', label: 'Vavuniya' },
    // Eastern Province
    { value: 'Trincomalee', label: 'Trincomalee' },
    { value: 'Batticaloa', label: 'Batticaloa' },
    { value: 'Ampara', label: 'Ampara' },
    { value: 'Kalmunai', label: 'Kalmunai' },
    // North Western Province
    { value: 'Kurunegala', label: 'Kurunegala' },
    { value: 'Puttalam', label: 'Puttalam' },
    { value: 'Chilaw', label: 'Chilaw' },
    // North Central Province
    { value: 'Anuradhapura', label: 'Anuradhapura' },
    { value: 'Polonnaruwa', label: 'Polonnaruwa' },
    // Uva Province
    { value: 'Badulla', label: 'Badulla' },
    { value: 'Monaragala', label: 'Monaragala' },
    { value: 'Bandarawela', label: 'Bandarawela' },
    // Sabaragamuwa Province
    { value: 'Ratnapura', label: 'Ratnapura' },
    { value: 'Kegalle', label: 'Kegalle' },
    // Other major towns
    { value: 'Wattala', label: 'Wattala' },
    { value: 'Kaduwela', label: 'Kaduwela' },
    { value: 'Maharagama', label: 'Maharagama' },
    { value: 'Nugegoda', label: 'Nugegoda' },
    { value: 'Piliyandala', label: 'Piliyandala' },
    { value: 'Horana', label: 'Horana' },
    { value: 'Kadawatha', label: 'Kadawatha' },
    { value: 'Kelaniya', label: 'Kelaniya' },
    { value: 'Ja-Ela', label: 'Ja-Ela' },
    { value: 'Kattankudy', label: 'Kattankudy' },
    { value: 'Hatton', label: 'Hatton' },
    { value: 'Beruwala', label: 'Beruwala' },
    { value: 'Embilipitiya', label: 'Embilipitiya' },
    { value: 'Balangoda', label: 'Balangoda' },
    { value: 'Point Pedro', label: 'Point Pedro' },
    { value: 'Valvettithurai', label: 'Valvettithurai' },
    { value: 'Eravur', label: 'Eravur' },
];

const MAX_EVIDENCE_FILES = 5;
const MAX_EVIDENCE_FILE_SIZE_BYTES = 25 * 1024 * 1024;
type LeafletBounds = [[number, number], [number, number]];

const SRI_LANKA_BOUNDS = {
    north: 9.9,
    south: 5.9,
    east: 81.9,
    west: 79.5,
};
const SRI_LANKA_LEAFLET_BOUNDS: LeafletBounds = [
    [SRI_LANKA_BOUNDS.south, SRI_LANKA_BOUNDS.west],
    [SRI_LANKA_BOUNDS.north, SRI_LANKA_BOUNDS.east],
];
const COLOMBO_CENTER: [number, number] = [6.9271, 79.8612];
const DISTRICT_OPTIONS = [
    { value: '', label: 'Select District' },
    ...SRI_LANKA_DISTRICTS.map((district) => ({ value: district, label: district })),
];
const DISTRICT_CENTERS: Record<string, [number, number]> = {
    Colombo: [6.9271, 79.8612],
    Gampaha: [7.0873, 80.0144],
    Kalutara: [6.5854, 79.9607],
    Kandy: [7.2906, 80.6337],
    Matale: [7.4675, 80.6234],
    'Nuwara Eliya': [6.9497, 80.7891],
    Galle: [6.0535, 80.2210],
    Matara: [5.9549, 80.5550],
    Hambantota: [6.1248, 81.1185],
    Jaffna: [9.6615, 80.0255],
    Kilinochchi: [9.3803, 80.3770],
    Mannar: [8.9810, 79.9044],
    Mullaitivu: [9.2671, 80.8142],
    Vavuniya: [8.7514, 80.4971],
    Trincomalee: [8.5874, 81.2152],
    Batticaloa: [7.7170, 81.7000],
    Ampara: [7.3018, 81.6747],
    Kurunegala: [7.4863, 80.3623],
    Puttalam: [8.0408, 79.8394],
    Anuradhapura: [8.3114, 80.4037],
    Polonnaruwa: [7.9403, 81.0188],
    Badulla: [6.9934, 81.0550],
    Monaragala: [6.8728, 81.3507],
    Ratnapura: [6.6828, 80.3992],
    Kegalle: [7.2513, 80.3464],
};

type ReverseGeocodeAddress = {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    state_district?: string;
    county?: string;
    city_district?: string;
    municipality?: string;
    city?: string;
    town?: string;
    village?: string;
};

type ReverseGeocodeResponse = {
    address?: ReverseGeocodeAddress;
    display_name?: string;
};

interface LeafletLatLng {
    lat: number;
    lng: number;
}

interface LeafletMouseEvent {
    latlng: LeafletLatLng;
}

interface LeafletMapInstance {
    setView(center: [number, number], zoom: number): LeafletMapInstance;
    on(event: 'click', handler: (event: LeafletMouseEvent) => void): void;
    invalidateSize(): void;
    remove(): void;
}

interface LeafletMarkerInstance {
    addTo(map: LeafletMapInstance): LeafletMarkerInstance;
    bindPopup(text: string): LeafletMarkerInstance;
    openPopup(): LeafletMarkerInstance;
    on(event: 'dragend', handler: () => void): void;
    getLatLng(): LeafletLatLng;
    setLatLng(position: LeafletLatLng | [number, number]): void;
}

interface LeafletTileLayer {
    addTo(map: LeafletMapInstance): void;
}

interface LeafletApi {
    map(element: HTMLElement, options?: {
        maxBounds?: LeafletBounds;
        maxBoundsViscosity?: number;
        minZoom?: number;
    }): LeafletMapInstance;
    tileLayer(
        url: string,
        options: {
            attribution: string;
            maxZoom: number;
            maxNativeZoom?: number;
            bounds?: LeafletBounds;
        },
    ): LeafletTileLayer;
    marker(position: [number, number], options: { draggable: boolean }): LeafletMarkerInstance;
}

declare global {
    interface Window {
        L?: LeafletApi;
    }
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

const isWithinSriLankaBounds = (lat: number, lng: number) =>
    lat >= SRI_LANKA_BOUNDS.south &&
    lat <= SRI_LANKA_BOUNDS.north &&
    lng >= SRI_LANKA_BOUNDS.west &&
    lng <= SRI_LANKA_BOUNDS.east;

const clampToSriLankaBounds = (lat: number, lng: number): [number, number] => [
    Math.min(Math.max(lat, SRI_LANKA_BOUNDS.south), SRI_LANKA_BOUNDS.north),
    Math.min(Math.max(lng, SRI_LANKA_BOUNDS.west), SRI_LANKA_BOUNDS.east),
];

const normalizeDistrictName = (value?: string | null) => {
    const cleaned = value?.replace(/\s+district$/i, '').trim().toLowerCase();
    if (!cleaned) return '';
    return SRI_LANKA_DISTRICTS.find((district) => district.toLowerCase() === cleaned) || '';
};

const getNearestDistrict = (lat: number, lng: number) => {
    let bestDistrict = 'Colombo';
    let bestDistance = Number.POSITIVE_INFINITY;

    Object.entries(DISTRICT_CENTERS).forEach(([district, [districtLat, districtLng]]) => {
        const distance = ((lat - districtLat) ** 2) + ((lng - districtLng) ** 2);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestDistrict = district;
        }
    });

    return bestDistrict;
};

const extractDistrictFromReverseGeocode = (data: ReverseGeocodeResponse | null, lat: number, lng: number) => {
    const address = data?.address || {};
    const candidates = [
        address.state_district,
        address.county,
        address.city_district,
        address.municipality,
        address.city,
        address.town,
        address.village,
        ...(typeof data?.display_name === 'string' ? data.display_name.split(',') : []),
    ];

    for (const candidate of candidates) {
        const district = normalizeDistrictName(candidate);
        if (district) return district;
    }

    return getNearestDistrict(lat, lng);
};

// --- Interactive Map Component (Leaflet via CDN) ---
const LocationMap: React.FC<{
    lat: number;
    lng: number;
    district: string;
    onLocationChange: (lat: number, lng: number) => void;
}> = ({ lat, lng, district, onLocationChange }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<LeafletMapInstance | null>(null);
    const markerRef = useRef<LeafletMarkerInstance | null>(null);

    useEffect(() => {
        // Load Leaflet CSS
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Load Leaflet JS
        const loadLeaflet = (): Promise<LeafletApi> => {
            return new Promise((resolve) => {
                if (window.L) {
                    resolve(window.L);
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                script.onload = () => resolve(window.L as LeafletApi);
                document.head.appendChild(script);
            });
        };

        loadLeaflet().then((L) => {
            if (!mapRef.current || mapInstanceRef.current) return;

            const isDefaultLocation = isDefaultReportCoordinates(lat, lng);
            const map = L.map(mapRef.current, {
                maxBounds: SRI_LANKA_LEAFLET_BOUNDS,
                maxBoundsViscosity: 1,
                minZoom: 7,
            }).setView(isDefaultLocation ? COLOMBO_CENTER : [lat, lng], isDefaultLocation ? 7 : 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
                maxNativeZoom: 19,
                bounds: SRI_LANKA_LEAFLET_BOUNDS,
            }).addTo(map);

            const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
            marker.bindPopup('Drag the pin to the incident location').openPopup();

            marker.on('dragend', () => {
                const pos = marker.getLatLng();
                const [boundedLat, boundedLng] = clampToSriLankaBounds(pos.lat, pos.lng);
                marker.setLatLng([boundedLat, boundedLng]);
                onLocationChange(boundedLat, boundedLng);
            });

            map.on('click', (e: LeafletMouseEvent) => {
                const [boundedLat, boundedLng] = clampToSriLankaBounds(e.latlng.lat, e.latlng.lng);
                marker.setLatLng([boundedLat, boundedLng]);
                onLocationChange(boundedLat, boundedLng);
            });

            mapInstanceRef.current = map;
            markerRef.current = marker;

            // Fix map rendering
            setTimeout(() => map.invalidateSize(), 200);
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update marker when lat/lng changes externally (e.g., GPS)
    useEffect(() => {
        if (markerRef.current && mapInstanceRef.current) {
            markerRef.current.setLatLng([lat, lng]);
            mapInstanceRef.current.setView([lat, lng], isDefaultReportCoordinates(lat, lng) ? 7 : 14);
        }
    }, [lat, lng]);

    return (
        <div className={styles.mapShell}>
            <div className={styles.mapBadge}>
                District: {district || getNearestDistrict(lat, lng)}
            </div>
            <div ref={mapRef} className={styles.mapCanvas} />
        </div>
    );
};


export const ReportWizard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
    const [draftSaveStatus, setDraftSaveStatus] = useState<string | null>(null);
    const [draftFileWarning, setDraftFileWarning] = useState<string | null>(null);
    const [submittedId, setSubmittedId] = useState<string | null>(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsError, setGpsError] = useState('');
    const [draftReady, setDraftReady] = useState(false);
    const [resumeNotice, setResumeNotice] = useState<string | null>(null);
    const [submitStatus, setSubmitStatus] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState<ReportFormData>(() => getDefaultReportFormData());

    const [errors, setErrors] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let active = true;

        const restoreDraft = async () => {
            try {
                const draft = await loadPendingReportDraft();
                if (!active) return;

                if (draft) {
                    setFormData(draft);
                    setCurrentStep(4);
                    const loginRestored = (location.state as { draftRestored?: boolean } | null)?.draftRestored;
                    setResumeNotice(loginRestored ? 'Login successful. Your draft report was restored.' : 'Your saved report draft has been restored. Review it and submit.');
                }
            } catch (error) {
                console.error('Failed to restore report draft', error);
            } finally {
                if (active) {
                    setDraftReady(true);
                }
            }
        };

        restoreDraft();

        return () => {
            active = false;
        };
    }, [location.state]);

    const hasUnsavedReportData = useCallback(() => {
        const defaults = getDefaultReportFormData();
        return Boolean(
            formData.violationType ||
            formData.location ||
            formData.city ||
            formData.district ||
            formData.description ||
            formData.customViolationDescription ||
            formData.vehiclePlate ||
            formData.vehicleType ||
            formData.evidenceFiles.length > 0 ||
            formData.date !== defaults.date ||
            formData.time !== defaults.time ||
            !isDefaultReportCoordinates(formData.lat, formData.lng)
        );
    }, [formData]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!submittedId && hasUnsavedReportData()) {
                event.preventDefault();
                event.returnValue = 'You have unsaved report data.';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedReportData, submittedId]);

    const reverseGeocodeLocation = useCallback((lat: number, lng: number, overwriteText = false) => {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`)
            .then(res => res.json())
            .then((data: ReverseGeocodeResponse) => {
                const addr = data.address || {};
                const locationStr = [addr.road, addr.suburb, addr.neighbourhood].filter(Boolean).join(', ') || data.display_name?.split(',').slice(0, 2).join(',') || '';
                const cityStr = addr.city || addr.town || addr.village || addr.county || '';
                const districtStr = extractDistrictFromReverseGeocode(data, lat, lng);
                setFormData(prev => ({
                    ...prev,
                    location: overwriteText || !prev.location ? locationStr : prev.location,
                    city: overwriteText || !prev.city ? cityStr : prev.city,
                    district: districtStr || getNearestDistrict(lat, lng),
                }));
            })
            .catch(() => {
                setFormData(prev => ({
                    ...prev,
                    district: getNearestDistrict(lat, lng),
                }));
            });
    }, []);

    // Auto-fetch current location on step 2
    const fetchCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setGpsError('Geolocation is not supported by your browser.');
            return;
        }
        setGpsLoading(true);
        setGpsError('');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                if (!isWithinSriLankaBounds(latitude, longitude)) {
                    setGpsLoading(false);
                    setGpsError('Your current location appears outside Sri Lanka. Please place the pin within Sri Lanka.');
                    return;
                }

                setFormData(prev => ({
                    ...prev,
                    lat: latitude,
                    lng: longitude,
                    district: getNearestDistrict(latitude, longitude),
                }));
                reverseGeocodeLocation(latitude, longitude, true);
                setGpsLoading(false);
            },
            (error) => {
                setGpsLoading(false);
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        setGpsError('Location access denied. Please allow location or place a pin on the map.');
                        break;
                    case error.POSITION_UNAVAILABLE:
                        setGpsError('Location unavailable. Please place a pin on the map.');
                        break;
                    default:
                        setGpsError('Could not get location. Please place a pin on the map.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, [reverseGeocodeLocation]);

    // Auto-fetch on entering step 2
    useEffect(() => {
        if (!draftReady) return;
        if (currentStep === 2 && isDefaultReportCoordinates(formData.lat, formData.lng)) {
            fetchCurrentLocation();
        }
    }, [currentStep, draftReady, formData.lat, formData.lng, fetchCurrentLocation]);

    const handleMapLocationChange = (lat: number, lng: number) => {
        const [boundedLat, boundedLng] = clampToSriLankaBounds(lat, lng);
        setFormData(prev => ({ ...prev, lat: boundedLat, lng: boundedLng, district: getNearestDistrict(boundedLat, boundedLng) }));
        reverseGeocodeLocation(boundedLat, boundedLng);
    };

    const handleBack = () => {
        setCurrentStep((prev) => prev - 1);
    };

    const buildValidationResult = (stepsToValidate: number[]) => {
        const newErrors: Record<string, string> = {};
        let isValid = true;
        let firstInvalidStep: number | null = null;

        const markInvalid = (step: number, key: string, message: string) => {
            if (!newErrors[key]) {
                newErrors[key] = message;
            }
            if (firstInvalidStep === null) {
                firstInvalidStep = step;
            }
            isValid = false;
        };

        if (stepsToValidate.includes(1)) {
            if (!formData.violationType) {
                markInvalid(1, 'violationType', 'Please select a violation type.');
            }
            if (formData.violationType === 'other' && !formData.customViolationDescription.trim()) {
                markInvalid(1, 'customViolationDescription', 'Describe the violation when selecting Other.');
            }
        }

        if (stepsToValidate.includes(2)) {
            if (!formData.date) markInvalid(2, 'date', 'Date is required.');
            if (!formData.time) markInvalid(2, 'time', 'Time is required.');
            if (!formData.location) markInvalid(2, 'location', 'Location description is required.');
            if (!formData.city) markInvalid(2, 'city', 'City is required.');
            if (!formData.district) markInvalid(2, 'district', 'District is required.');
            if (!isWithinSriLankaBounds(formData.lat, formData.lng)) {
                markInvalid(2, 'mapLocation', 'Location must be within Sri Lanka.');
            }
            if (isDefaultReportCoordinates(formData.lat, formData.lng)) {
                markInvalid(2, 'mapLocation', 'Choose the exact incident location on the map or use current location.');
            }

            // Future date validation
            const selectedDate = new Date(`${formData.date}T${formData.time}`);
            if (selectedDate > new Date()) {
                markInvalid(2, 'date', 'Cannot report violations in the future.');
            }
        }

        if (stepsToValidate.includes(3)) {
            if (formData.evidenceFiles.length === 0) {
                markInvalid(3, 'evidence', 'At least one image or video is required.');
            }
        }

        return { isValid, newErrors, firstInvalidStep };
    };

    const validateStep = (step: number) => {
        const { isValid, newErrors } = buildValidationResult([step]);
        setErrors(newErrors);
        return isValid;
    };

    const validateReportForSubmit = () => {
        const { isValid, newErrors, firstInvalidStep } = buildValidationResult([1, 2, 3, 4]);
        setErrors(newErrors);

        if (!isValid && firstInvalidStep !== null) {
            setCurrentStep(firstInvalidStep);
            window.scrollTo(0, 0);
        }

        return isValid;
    };

    const handleNext = async () => {
        if (currentStep === 4) {
            if (!validateReportForSubmit()) {
                return;
            }

            let draftSaved = true;
            await savePendingReportDraft(formData).catch((error) => {
                draftSaved = false;
                console.error('Failed to persist the report draft before final submission', error);
            });

            if (!auth.isCitizenAuthenticated()) {
                setDraftSaveStatus(draftSaved ? 'Draft saved. Evidence files should be restored automatically after login.' : 'Draft save was incomplete.');
                setDraftFileWarning(draftSaved ? null : 'Please re-upload evidence files after login.');
                setIsLoginPromptOpen(true);
                return;
            }

            await submitCitizenReportWithExistingSession();
            return;
        }

        if (validateStep(currentStep)) {
            setCurrentStep((prev) => prev + 1);
            window.scrollTo(0, 0);
        }
    };

    const buildCitizenReportPayload = async () => {
        const localDate = new Date(`${formData.date}T${formData.time}`);
        return {
            violationType: formData.violationType as ViolationType,
            datetime: localDate.toISOString(),
            location: {
                lat: formData.lat,
                lng: formData.lng,
                address: formData.location,
                city: formData.city,
                district: formData.district,
            },
            customViolationDescription: formData.violationType === 'other' ? formData.customViolationDescription.trim() : null,
            evidence: await Promise.all(
                formData.evidenceFiles.map(async (f, i) => ({
                    id: `ev-${i}`,
                    type: f.type.startsWith('video') ? ('video' as const) : ('image' as const),
                    url: URL.createObjectURL(f),
                    name: f.name,
                    size: f.size,
                    mimeType: f.type || undefined,
                    file: f,
                }))
            ),
            vehicle: {
                plate: formData.vehiclePlate,
                type: formData.vehicleType,
                notes: formData.description,
            },
        };
    };

    const finalizeCitizenReportSubmission = async (
        submitRequest: (payload: Awaited<ReturnType<typeof buildCitizenReportPayload>>) => Promise<{ trackingId: string }>
    ) => {
        setIsSubmitting(true);
        setSubmitStatus('Uploading evidence securely...');
        try {
            const payload = await buildCitizenReportPayload();
            setSubmitStatus('Creating report and queueing AI review...');
            const report = await submitRequest(payload);
            await clearPendingReportDraft().catch(() => undefined);
            setSubmittedId(report.trackingId);
        } catch (error: unknown) {
            console.error('Submission failed', error);
            await savePendingReportDraft(formData).catch((draftError) => {
                console.error('Failed to preserve the report draft after submission error', draftError);
            });
            setResumeNotice('Your report draft is still saved. You can retry final submit without re-entering the form.');
            const message = `Failed to submit report: ${getErrorMessage(error, 'Unknown error')} Your form data is still saved.`;
            setErrors({ submit: message });
            throw new Error(message);
        } finally {
            setSubmitStatus(null);
            setIsSubmitting(false);
        }
    };

    const submitCitizenReportWithExistingSession = async () => {
        const userSession = auth.getSession();
        if (auth.isCitizenAuthenticated()) {
            await finalizeCitizenReportSubmission((payload) =>
                mockDb.createReport({
                    citizen: { email: userSession?.email || 'citizen@lexvision.gov' },
                    violationType: payload.violationType,
                    datetime: payload.datetime,
                    location: payload.location,
                    customViolationDescription: payload.customViolationDescription,
                    evidence: payload.evidence,
                    vehicle: payload.vehicle,
                })
            );
            return;
        }

        throw new Error('Please sign in with a citizen email account before submitting.');
    };

    const handleLoginRedirect = () => {
        const redirectPath = '/portal/report';
        navigate(`/login?redirect=${encodeURIComponent(redirectPath)}`, {
            state: {
                from: { pathname: redirectPath },
                draftPending: true,
            },
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const incomingFiles = Array.from(e.target.files);
            const acceptedFiles = incomingFiles.filter((file) =>
                (file.type.startsWith('image/') || file.type.startsWith('video/')) &&
                file.size > 0 &&
                file.size <= MAX_EVIDENCE_FILE_SIZE_BYTES
            );

            if (acceptedFiles.length !== incomingFiles.length) {
                setErrors((current) => ({
                    ...current,
                    evidence: 'Only image/video files up to 25 MB are supported.',
                }));
            } else {
                setErrors((current) => {
                    const nextErrors = { ...current };
                    delete nextErrors.evidence;
                    return nextErrors;
                });
            }

            setFormData(prev => ({
                ...prev,
                evidenceFiles: [...prev.evidenceFiles, ...acceptedFiles].slice(0, MAX_EVIDENCE_FILES),
            }));
        }
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        setFormData(prev => ({
            ...prev,
            evidenceFiles: prev.evidenceFiles.filter((_, i) => i !== index)
        }));
    };

    if (submittedId) {
        return (
            <div className={`container ${styles.successContainer}`}>
                <CheckCircle size={80} className={styles.successIcon} />
                <h1>Report Submitted Successfully!</h1>
                <p>Your report has been received and linked to your signed-in account.</p>

                <div className={styles.trackingBox}>
                    <span>Report Reference Number:</span>
                    <div className={styles.trackingId}>{submittedId}</div>
                </div>

                <p>Save this reference number to track the status of your report.</p>

                <div className={styles.actions} style={{ justifyContent: 'center', gap: '16px' }}>
                    <Link to="/portal/my-reports">
                        <Button variant="secondary">Open My Reports</Button>
                    </Link>
                    <Link to="/portal/track">
                        <Button variant="primary">Track Status</Button>
                    </Link>
                    <Link to="/">
                        <Button variant="secondary">Return Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className={`container ${styles.wizardContainer}`}>
            <h1 className={styles.title}>Report a Violation</h1>

            <Stepper steps={STEPS} currentStep={currentStep} />

            {resumeNotice && (
                <div
                    style={{
                        marginBottom: 'var(--space-4)',
                        padding: 'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                    }}
                >
                    {resumeNotice}
                </div>
            )}

            {Object.keys(errors).length > 0 && (
                <div
                    className={styles.errorSummary}
                    role="alert"
                    aria-labelledby="error-summary-title"
                    tabIndex={-1}
                >
                    <h3 id="error-summary-title">There is a problem</h3>
                    <ul>
                        {Object.entries(errors).map(([key, error]) => (
                            <li key={key}>
                                <a href={`#${key}-input`} onClick={(e) => {
                                    e.preventDefault();
                                    document.getElementById(`${key}-input`)?.focus();
                                }}>
                                    {error}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={styles.stepContent}>
                {/* Step 1: Violation Type */}
                {currentStep === 1 && (
                    <div className={styles.stepPanel}>
                        <div className={styles.sectionHeader}>
                            <h2>What happened?</h2>
                            <p>Select the closest category. If it does not fit, choose Other and describe it.</p>
                        </div>
                        <div id="violationType-input" className={styles.violationGrid} tabIndex={-1}>
                            {[
                                { id: 'helmet' as ViolationType, label: 'Helmet Violation', icon: <Radio size={24} /> },
                                { id: 'red_light' as ViolationType, label: 'Red Light Violation', icon: <X size={24} /> },
                                { id: 'white_line' as ViolationType, label: 'White Line Crossing', icon: <FileText size={24} /> },
                                { id: 'other' as ViolationType, label: 'Other Violation', icon: <FileText size={24} /> },
                            ].map(type => (
                                <Card
                                    key={type.id}
                                    className={`${styles.violationCard} ${formData.violationType === type.id ? styles.selected : ''}`}
                                    onClick={() => setFormData({
                                        ...formData,
                                        violationType: type.id,
                                        customViolationDescription: type.id === 'other' ? formData.customViolationDescription : '',
                                    })}
                                    padding="lg"
                                >
                                    <div className={styles.violationIcon}>{type.icon}</div>
                                    <div>
                                        <h3>{type.label}</h3>
                                    </div>
                                </Card>
                            ))}
                        </div>
                        {errors.violationType && <p className={styles.errorMessage}>{errors.violationType}</p>}

                        {formData.violationType === 'other' && (
                            <div className="form-group">
                                <label className="form-label" htmlFor="customViolationDescription-input">
                                    Describe the violation <span className={styles.requiredMark}>*</span>
                                </label>
                                <textarea
                                    id="customViolationDescription-input"
                                    className="form-textarea"
                                    rows={4}
                                    placeholder="Explain what the driver or rider did, including lane, signal, direction, and any safety risk."
                                    value={formData.customViolationDescription}
                                    onChange={e => setFormData({ ...formData, customViolationDescription: e.target.value })}
                                />
                                {errors.customViolationDescription && <p className={styles.errorMessage}>{errors.customViolationDescription}</p>}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Location & Time */}
                {currentStep === 2 && (
                    <div className={`${styles.stepPanel} form-grid`}>
                        <div className={styles.sectionHeader}>
                            <h2>Where and when?</h2>
                            <p>Reports are accepted only for locations inside Sri Lanka. The district can be auto-filled from the map and changed manually.</p>
                        </div>
                        <div className="form-grid form-grid--2-col">
                            <Input
                                id="date-input"
                                label="Date of Incident *"
                                type="date"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                error={errors.date}
                                max={new Date().toISOString().split('T')[0]}
                            />
                            <Input
                                id="time-input"
                                label="Time of Incident *"
                                type="time"
                                value={formData.time}
                                onChange={e => setFormData({ ...formData, time: e.target.value })}
                                error={errors.time}
                            />
                        </div>

                        <Select
                            id="district-input"
                            label="District *"
                            options={DISTRICT_OPTIONS}
                            value={formData.district}
                            onChange={e => setFormData({ ...formData, district: e.target.value })}
                            error={errors.district}
                            fullWidth
                        />

                        <Select
                            id="city-input"
                            label="City / Town *"
                            options={SRI_LANKAN_CITIES}
                            value={formData.city}
                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                            error={errors.city}
                        />

                        <Input
                            id="location-input"
                            label="Location / Landmark *"
                            placeholder="e.g. Near Liberty Plaza Junction"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            error={errors.location}
                        />

                        {/* GPS Fetch Button */}
                        <div className={styles.locationActionRow}>
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={gpsLoading ? <Loader2 size={16} className="spin-animation" /> : <Locate size={16} />}
                                onClick={fetchCurrentLocation}
                                disabled={gpsLoading}
                            >
                                {gpsLoading ? 'Fetching location...' : 'Use Current Location'}
                            </Button>
                            {gpsError && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-error)' }}>{gpsError}</span>
                            )}
                            {!gpsError && formData.lat !== 6.9271 && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle size={14} /> Location detected
                                </span>
                            )}
                        </div>

                        {/* Coordinates display */}
                        <div className={styles.coordinateSummary}>
                            <MapPin size={14} />
                            <span>{formData.lat.toFixed(6)}, {formData.lng.toFixed(6)}</span>
                        </div>

                        {/* Interactive Map */}
                        <div id="mapLocation-input" tabIndex={-1}>
                            <label className={styles.mapLabel}>
                                Pin Location on Map <span className={styles.requiredMark}>*</span>
                                <span>
                                    Click the map or drag the pin to set the exact incident location
                                </span>
                            </label>
                            <LocationMap
                                lat={formData.lat}
                                lng={formData.lng}
                                district={formData.district}
                                onLocationChange={handleMapLocationChange}
                            />
                            {errors.mapLocation && <p className={styles.errorMessage}>{errors.mapLocation}</p>}
                        </div>
                    </div>
                )}

                {/* Step 3: Evidence */}
                {currentStep === 3 && (
                    <div>
                        <div
                            className={styles.uploadArea}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload size={48} color="var(--color-primary)" style={{ marginBottom: '16px' }} />
                            <h3>Click to upload images or videos</h3>
                            <p>Supported formats: JPG, PNG, MP4</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,video/*"
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                            />
                        </div>
                        {errors.evidence && <p style={{ color: 'var(--color-error)', marginBottom: '16px' }}>{errors.evidence}</p>}

                        <div className={styles.fileList}>
                            {formData.evidenceFiles.map((file, index) => (
                                <div key={index} className={styles.fileItem}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Camera size={16} />
                                        <span>{file.name}</span>
                                        <span style={{ fontSize: '0.8rem', color: '#666' }}>({Math.round(file.size / 1024)} KB)</span>
                                    </div>
                                    <button
                                        onClick={() => removeFile(index)}
                                        style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 4: Vehicle & Notes */}
                {currentStep === 4 && (
                    <div className="form-grid">
                        <div
                            style={{
                                padding: 'var(--space-3) var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border)',
                                backgroundColor: 'var(--color-surface)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            You are signed in. Final submit will use your current email login.
                        </div>

                        <div className="form-grid form-grid--2-col">
                            <Input
                                label="Vehicle Number Plate (Optional)"
                                placeholder="e.g. WP CAA-1234"
                                value={formData.vehiclePlate}
                                onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })}
                            />
                            <Select
                                label="Vehicle Type (Optional)"
                                options={[
                                    { value: '', label: 'Select Type' },
                                    { value: 'motorbike', label: 'Motorbike' },
                                    { value: 'car', label: 'Car' },
                                    { value: 'three-wheeler', label: 'Three Wheeler' },
                                    { value: 'bus', label: 'Bus' },
                                    { value: 'van', label: 'Van' },
                                    { value: 'lorry', label: 'Lorry/Truck' },
                                ]}
                                value={formData.vehicleType}
                                onChange={e => setFormData({ ...formData, vehicleType: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Additional Description (Optional)</label>
                            <textarea
                                className="form-textarea"
                                rows={4}
                                placeholder="Describe the incident..."
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className={`form-actions form-actions--spread ${styles.footerActions}`}>
                <Button
                    variant="secondary"
                    onClick={handleBack}
                    disabled={currentStep === 1 || isSubmitting}
                    leftIcon={<ArrowLeft size={16} />}
                >
                    Back
                </Button>

                <Button
                    variant="primary"
                    onClick={handleNext}
                    isLoading={isSubmitting}
                    rightIcon={currentStep === 4 ? undefined : <ArrowRight size={16} />}
                >
                    {currentStep === 4 ? 'Submit Report' : 'Next Step'}
                </Button>
            </div>

            {isSubmitting && submitStatus && (
                <div style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {submitStatus}
                </div>
            )}

            {isLoginPromptOpen && (
                <div className={styles.modalBackdrop} role="presentation" onClick={() => setIsLoginPromptOpen(false)}>
                    <div className={styles.loginModal} role="dialog" aria-modal="true" aria-labelledby="login-required-title" onClick={(event) => event.stopPropagation()}>
                        <h2 id="login-required-title">Login Required</h2>
                        <p>You must log in before submitting a report. Your report draft will be saved/restored after login.</p>
                        {draftSaveStatus && <div className={styles.draftStatus}>{draftSaveStatus}</div>}
                        {draftFileWarning && <div className={styles.draftWarning}>{draftFileWarning}</div>}
                        <div className={styles.modalActions}>
                            <Button variant="secondary" onClick={() => setIsLoginPromptOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={handleLoginRedirect}>
                                Login Now
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
