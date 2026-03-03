import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera, MapPin, Radio, Upload, X, CheckCircle, FileText, ArrowRight, ArrowLeft } from 'lucide-react';
import { Stepper, Button, Card, Input, Select } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { ViolationType } from '@lexvision/types';
import styles from '@/pages/portal/ReportWizard.module.css';

const STEPS = [
    { id: 1, label: 'Violation Type' },
    { id: 2, label: 'Location & Time' },
    { id: 3, label: 'Evidence Details' },
    { id: 4, label: 'Vehicle Info' },
];

const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

export const ReportWizard: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedId, setSubmittedId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        violationType: '' as ViolationType | '',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        location: '',
        city: '',
        description: '',
        vehiclePlate: '',
        vehicleType: '',
        evidenceFiles: [] as File[],
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleNext = async () => {
        if (validateStep(currentStep)) {
            if (currentStep === 4) {
                await submitReport();
            } else {
                setCurrentStep((prev) => prev + 1);
                window.scrollTo(0, 0);
            }
        }
    };

    const handleBack = () => {
        setCurrentStep((prev) => prev - 1);
    };

    const validateStep = (step: number) => {
        const newErrors: Record<string, string> = {};
        let isValid = true;

        if (step === 1) {
            if (!formData.violationType) {
                newErrors.violationType = 'Please select a violation type.';
                isValid = false;
            }
        }

        if (step === 2) {
            if (!formData.date) newErrors.date = 'Date is required.';
            if (!formData.time) newErrors.time = 'Time is required.';
            if (!formData.location) newErrors.location = 'Location description is required.';
            if (!formData.city) newErrors.city = 'City is required.';

            // Future date validation
            const selectedDate = new Date(`${formData.date}T${formData.time}`);
            if (selectedDate > new Date()) {
                newErrors.date = 'Cannot report violations in the future.';
                isValid = false;
            }
        }

        if (step === 3) {
            if (formData.evidenceFiles.length === 0) {
                newErrors.evidence = 'At least one image or video is required.';
                isValid = false;
            }
        }

        setErrors(newErrors);
        return isValid;
    };

    const submitReport = async () => {
        setIsSubmitting(true);
        try {
            // Convert files to base64 so they can be saved and viewed across browsers
            const evidencePayload = await Promise.all(
                formData.evidenceFiles.map(async (f, i) => ({
                    id: `ev-${i}`,
                    type: f.type.startsWith('video') ? ('video' as const) : ('image' as const),
                    url: await getBase64(f), // Use base64 instead of transient blob URL
                    name: f.name,
                    size: f.size,
                }))
            );

            // Save report to backend — ML inference runs automatically as a background task
            const report = await mockDb.createReport({
                violationType: formData.violationType as ViolationType,
                datetime: `${formData.date}T${formData.time}`,
                location: {
                    lat: 6.9271, // Mock Lat/Lng for Colombo
                    lng: 79.8612,
                    address: formData.location,
                    city: formData.city,
                },
                evidence: evidencePayload,
                vehicle: {
                    plate: formData.vehiclePlate,
                    type: formData.vehicleType,
                    notes: formData.description,
                },
                citizen: {}, // Anonymous by default for wizard
            });
            setSubmittedId(report.trackingId);
        } catch (error) {
            console.error('Submission failed', error);
            setErrors({ submit: 'Failed to submit report. Please try again.' });
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
                <p>Your report has been received and is under review.</p>

                <div className={styles.trackingBox}>
                    <span>Tracking ID:</span>
                    <div className={styles.trackingId}>{submittedId}</div>
                </div>

                <p>Save this ID to track the status of your report.</p>

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

                        <Input
                            id="city-input"
                            label="City / Town"
                            placeholder="e.g. Colombo 03"
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

                        <div style={{ height: '200px', backgroundColor: '#eef', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px dashed #ccc' }}>
                            <div style={{ textAlign: 'center', color: '#666' }}>
                                <MapPin size={32} style={{ marginBottom: '8px' }} />
                                <p>Map Placeholder (Select location on map)</p>
                            </div>
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
                    {currentStep === 4 ? 'Submit Report' : 'Next Step'}
                </Button>
            </div>
        </div>
    );
};
