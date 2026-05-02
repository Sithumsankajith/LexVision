import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, FileText, History } from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Badge, DataTable, Panel } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';
import {
    formatViolationLabel,
    getOfficerReviewPriority,
    getQueueAISuggestion,
} from '../utils/officerAi';

const getStatusBadgeVariant = (status: Report['status']) =>
    status === 'submitted' ? 'info' :
        status === 'under-review' ? 'warning' :
            status === 'rejected' ? 'error' :
                'success';

const getSuggestionBadgeVariant = (label: string) =>
    label === 'Supports violation' ? 'success' :
        label === 'Failed' ? 'error' :
            label === 'Pending' ? 'info' :
                'neutral';

const getPriorityBadgeVariant = (priority: string) =>
    priority === 'High' ? 'success' :
        priority === 'Medium' ? 'info' :
            'warning';

export const Queue: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        };

        fetchReports();
        const interval = setInterval(fetchReports, 3000);
        return () => clearInterval(interval);
    }, []);

    const filteredReports = useMemo(() => {
        let result = reports;

        if (statusFilter !== 'all') {
            result = result.filter((report) => report.status === statusFilter);
        }

        if (search.trim()) {
            const query = search.toLowerCase();
            result = result.filter((report) =>
                report.trackingId.toLowerCase().includes(query) ||
                (report.location.address || '').toLowerCase().includes(query) ||
                (report.location.city || '').toLowerCase().includes(query) ||
                (report.vehicle?.plate || '').toLowerCase().includes(query) ||
                (report.claimedViolationType || '').toLowerCase().includes(query) ||
                (report.inferredViolationType || '').toLowerCase().includes(query) ||
                (report.finalViolationType || '').toLowerCase().includes(query) ||
                report.violationType.toLowerCase().includes(query)
            );
        }

        return result;
    }, [reports, search, statusFilter]);

    const handleResetFilters = () => {
        setSearch('');
        setStatusFilter('all');
    };

    const handleExport = async () => {
        try {
            await mockDb.adminExportReportsCsv();
        } catch {
            alert('Export failed. You may need admin privileges.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800', color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                        Violation Queue
                    </h1>
                    <p style={{ margin: 'var(--space-1) 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem', fontWeight: '500' }}>
                        Review citizen reports with clear AI summaries and officer-first priorities.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <Button variant="outline" leftIcon={<History size={18} />} onClick={() => navigate('/dashboard/history')}>
                        History
                    </Button>
                    <Button leftIcon={<FileText size={18} />} onClick={handleExport}>
                        Export Report
                    </Button>
                </div>
            </div>

            <Panel
                className="filter-bar"
                noPadding
                style={{
                    padding: 'var(--space-6)',
                    display: 'flex',
                    gap: 'var(--space-6)',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    backgroundColor: 'var(--color-surface)',
                    boxShadow: 'var(--shadow-md)',
                }}
            >
                <div style={{ flex: 1, minWidth: '280px' }}>
                    <Input
                        placeholder="Search by Case ID, location, vehicle number, or reported violation..."
                        fullWidth
                        style={{ height: '52px', fontSize: '1rem' }}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-secondary)', fontWeight: '700', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Filter size={18} /> Filters
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'submitted', label: 'New Reports' },
                            { value: 'under-review', label: 'In Review' },
                            { value: 'verified', label: 'Verified' },
                            { value: 'rejected', label: 'Rejected' },
                            { value: 'closed', label: 'Closed' },
                        ]}
                        style={{ width: '180px', height: '52px' }}
                    />
                </div>

                <Button
                    variant="ghost"
                    style={{ height: '52px', fontWeight: '700', color: 'var(--color-primary)' }}
                    onClick={handleResetFilters}
                >
                    Reset Filters
                </Button>
            </Panel>

            <Panel
                title="Active Cases"
                action={<Badge variant="info">{loading ? 'Syncing...' : `${filteredReports.length} Reports Found`}</Badge>}
                noPadding
            >
                <DataTable headers={['Case ID', 'Citizen Reported Violation', 'AI Suggestion', 'Review Priority', 'Submitted Time', 'Status', 'Action']}>
                    {filteredReports.map((item) => {
                        const suggestion = getQueueAISuggestion(item.aiSummary);
                        const reviewPriority = getOfficerReviewPriority(item.aiSummary);

                        return (
                            <tr key={item.id}>
                                <td style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-primary)', fontSize: '0.875rem' }}>
                                    #{item.trackingId.substring(0, 12)}
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>
                                            {formatViolationLabel(item.claimedViolationType || item.violationType)}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                            {item.location.address || item.location.city}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <Badge variant={getSuggestionBadgeVariant(suggestion)}>
                                        {suggestion}
                                    </Badge>
                                </td>
                                <td>
                                    <Badge variant={getPriorityBadgeVariant(reviewPriority)}>
                                        {reviewPriority}
                                    </Badge>
                                </td>
                                <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                    {new Date(item.createdAt).toLocaleDateString()}
                                    <br />
                                    <span style={{ opacity: 0.7 }}>
                                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </td>
                                <td>
                                    <Badge variant={getStatusBadgeVariant(item.status)}>
                                        {item.status.replace(/-/g, ' ')}
                                    </Badge>
                                </td>
                                <td>
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => navigate(`/dashboard/queue/${item.id}`)}
                                        style={{ fontWeight: '700', borderRadius: 'var(--radius-md)' }}
                                    >
                                        Details
                                    </Button>
                                </td>
                            </tr>
                        );
                    })}
                    {filteredReports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '4rem' }}>
                                <div style={{ opacity: 0.5, fontSize: '1.25rem' }}>
                                    {search || statusFilter !== 'all' ? 'No cases match your filters' : 'No violation cases in the queue'}
                                </div>
                            </td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
