import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Camera, MapPin, Radio, Upload, X, CheckCircle, FileText, ArrowRight, ArrowLeft, Locate, Loader2 } from 'lucide-react';
import { Stepper, Button, Card, Input, Select } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { ViolationType } from '@lexvision/types';
import { CitizenOtpLoginModal, type CitizenOtpVerificationResult } from '@/components/CitizenOtpLoginModal';
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

const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
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
    map(element: HTMLElement): LeafletMapInstance;
    tileLayer(
        url: string,
        options: {
            attribution: string;
            maxZoom: number;
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

// --- Interactive Map Component (Leaflet via CDN) ---
const LocationMap: React.FC<{
    lat: number;
    lng: number;
    onLocationChange: (lat: number, lng: number) => void;
}> = ({ lat, lng, onLocationChange }) => {
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

            const map = L.map(mapRef.current).setView([lat, lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
            marker.bindPopup('📍 Drag me to the incident location').openPopup();

            marker.on('dragend', () => {
                const pos = marker.getLatLng();
                onLocationChange(pos.lat, pos.lng);
            });

            map.on('click', (e: LeafletMouseEvent) => {
                marker.setLatLng(e.latlng);
                onLocationChange(e.latlng.lat, e.latlng.lng);
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
            mapInstanceRef.current.setView([lat, lng], 14);
        }
    }, [lat, lng]);

    return (
        <div
            ref={mapRef}
            style={{
                height: '300px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
                zIndex: 1
            }}
        />
    );
};


export const ReportWizard: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [submittedId, setSubmittedId] = useState<string | null>(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsError, setGpsError] = useState('');
    const [draftReady, setDraftReady] = useState(false);
    const [resumeNotice, setResumeNotice] = useState<string | null>(null);

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
                    setResumeNotice('Your saved report draft has been restored. Review it and submit.');
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
                setFormData(prev => ({
                    ...prev,
                    lat: latitude,
                    lng: longitude
                }));
                // Reverse geocode to get address
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.display_name) {
                            const addr = data.address || {};
                            const locationStr = [addr.road, addr.suburb, addr.neighbourhood].filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',');
                            const cityStr = addr.city || addr.town || addr.village || addr.county || '';
                            setFormData(prev => ({
                                ...prev,
                                location: locationStr,
                                city: cityStr,
                            }));
                        }
                    })
                    .catch(() => { /* reverse geocode failed, user can enter manually */ })
                    .finally(() => setGpsLoading(false));
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
    }, []);

    // Auto-fetch on entering step 2
    useEffect(() => {
        if (!draftReady) return;
        if (currentStep === 2 && isDefaultReportCoordinates(formData.lat, formData.lng)) {
            fetchCurrentLocation();
        }
    }, [currentStep, draftReady, formData.lat, formData.lng, fetchCurrentLocation]);

    const handleMapLocationChange = (lat: number, lng: number) => {
        setFormData(prev => ({ ...prev, lat, lng }));
        // Reverse geocode the new pin location
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
            .then(res => res.json())
            .then(data => {
                if (data.display_name) {
                    const addr = data.address || {};
                    const locationStr = [addr.road, addr.suburb, addr.neighbourhood].filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',');
                    const cityStr = addr.city || addr.town || addr.village || addr.county || '';
                    setFormData(prev => ({
                        ...prev,
                        location: prev.location || locationStr,
                        city: prev.city || cityStr,
                    }));
                }
            })
            .catch(() => { /* continue silently */ });
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
        }

        if (stepsToValidate.includes(2)) {
            if (!formData.date) markInvalid(2, 'date', 'Date is required.');
            if (!formData.time) markInvalid(2, 'time', 'Time is required.');
            if (!formData.location) markInvalid(2, 'location', 'Location description is required.');
            if (!formData.city) markInvalid(2, 'city', 'City is required.');

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

            await savePendingReportDraft(formData).catch((error) => {
                console.error('Failed to persist the report draft before OTP verification', error);
            });
            setIsOtpModalOpen(true);
            return;
        }

        if (validateStep(currentStep)) {
            setCurrentStep((prev) => prev + 1);
            window.scrollTo(0, 0);
        }
    };

    const submitCitizenReport = async (verificationResult: CitizenOtpVerificationResult) => {
        setIsSubmitting(true);
        try {
            // Convert files to base64 so they can be saved and viewed across browsers
            const evidencePayload = await Promise.all(
                formData.evidenceFiles.map(async (f, i) => ({
                    id: `ev-${i}`,
                    type: f.type.startsWith('video') ? ('video' as const) : ('image' as const),
                    url: await getBase64(f),
                    name: f.name,
                    size: f.size,
                    mimeType: f.type || undefined,
                }))
            );

            const report = await mockDb.submitCitizenReportWithFirebase(verificationResult.idToken, {
                violationType: formData.violationType as ViolationType,
                datetime: `${formData.date}T${formData.time}`,
                location: {
                    lat: formData.lat,
                    lng: formData.lng,
                    address: formData.location,
                    city: formData.city,
                },
                evidence: evidencePayload,
                vehicle: {
                    plate: formData.vehiclePlate,
                    type: formData.vehicleType,
                    notes: formData.description,
                },
            });
            await clearPendingReportDraft().catch(() => undefined);
            setSubmittedId(report.trackingId);
        } catch (error: unknown) {
            console.error('Submission failed', error);
            await savePendingReportDraft(formData).catch((draftError) => {
                console.error('Failed to preserve the report draft after submission error', draftError);
            });
            setResumeNotice('Your report draft is still saved. You can retry the OTP verification or final submit without re-entering the form.');
            const message = `Failed to submit report: ${getErrorMessage(error, 'Unknown error')} Your form data is still saved.`;
            setErrors({ submit: message });
            throw new Error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setFormData(prev => ({ ...prev, evidenceFiles: [...prev.evidenceFiles, ...files] }));
        }
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
                <p>Your OTP-verified report has been received and linked to your verified phone number.</p>

                <div className={styles.trackingBox}>
                    <span>Report Reference Number:</span>
                    <div className={styles.trackingId}>{submittedId}</div>
                </div>

                <p>Save this reference number to track the status of your report.</p>

                <div className={styles.actions} style={{ justifyContent: 'center', gap: '16px' }}>
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
                    <div className="card-grid">
                        {[
                            { id: 'helmet' as ViolationType, label: 'No Helmet', icon: <Radio size={24} /> },
                            { id: 'red-light' as ViolationType, label: 'Red Light Violation', icon: <X size={24} /> },
                            { id: 'white-line' as ViolationType, label: 'White Line Crossing', icon: <FileText size={24} /> },
                        ].map(type => (
                            <Card
                                key={type.id}
                                className={`${styles.violationCard} ${formData.violationType === type.id ? styles.selected : ''}`}
                                onClick={() => setFormData({ ...formData, violationType: type.id })}
                                padding="lg"
                            >
                                <div className={styles.violationIcon}>{type.icon}</div>
                                <div>
                                    <h3>{type.label}</h3>
                                </div>
                            </Card>
                        ))}
                        {errors.violationType && <p className={styles.errorMessage}>{errors.violationType}</p>}
                    </div>
                )}

                {/* Step 2: Location & Time */}
                {currentStep === 2 && (
                    <div className="form-grid">
                        <div className="form-grid form-grid--2-col">
                            <Input
                                id="date-input"
                                label="Date of Incident"
                                type="date"
                                value={formData.date}
                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                error={errors.date}
                                max={new Date().toISOString().split('T')[0]}
                            />
                            <Input
                                id="time-input"
                                label="Time of Incident"
                                type="time"
                                value={formData.time}
                                onChange={e => setFormData({ ...formData, time: e.target.value })}
                                error={errors.time}
                            />
                        </div>

                        <Select
                            id="city-input"
                            label="City / Town"
                            options={SRI_LANKAN_CITIES}
                            value={formData.city}
                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                            error={errors.city}
                        />

                        <Input
                            id="location-input"
                            label="Location / Landmark"
                            placeholder="e.g. Near Liberty Plaza Junction"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            error={errors.location}
                        />

                        {/* GPS Fetch Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={gpsLoading ? <Loader2 size={16} className="spin-animation" /> : <Locate size={16} />}
                                onClick={fetchCurrentLocation}
                                disabled={gpsLoading}
                            >
                                {gpsLoading ? 'Fetching location...' : 'Use My Current Location'}
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
                        <div style={{
                            fontSize: '0.8rem',
                            color: 'var(--color-text-secondary)',
                            fontFamily: 'monospace',
                            padding: 'var(--space-2) var(--space-3)',
                            backgroundColor: 'var(--color-background)',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-3)'
                        }}>
                            <MapPin size={14} />
                            <span>Lat: {formData.lat.toFixed(6)}, Lng: {formData.lng.toFixed(6)}</span>
                        </div>

                        {/* Interactive Map */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: 'var(--space-2)', color: 'var(--color-text)' }}>
                                📍 Pin Location on Map
                                <span style={{ fontWeight: '400', color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)', fontSize: '0.8rem' }}>
                                    Click the map or drag the pin to set the exact incident location
                                </span>
                            </label>
                            <LocationMap
                                lat={formData.lat}
                                lng={formData.lng}
                                onLocationChange={handleMapLocationChange}
                            />
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
                            You can complete the entire report first. When you press the final submit button, a phone OTP dialog will open to verify your number before the report is sent.
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

            <div className="form-actions form-actions--spread">
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
                    {currentStep === 4 ? 'Verify Phone & Submit' : 'Next Step'}
                </Button>
            </div>

            <CitizenOtpLoginModal
                isOpen={isOtpModalOpen}
                onClose={() => setIsOtpModalOpen(false)}
                onVerified={submitCitizenReport}
                description="Verify your Sri Lankan mobile number to complete the final report submission. After verification, LexVision will submit the evidence and generate a report reference number."
            />
        </div>
    );
};
