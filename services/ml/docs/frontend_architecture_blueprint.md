# LexVision Admin Analytics Dashboard: Frontend React Architecture

This document serves as the structural blueprint for developing the frontend Administration Dashboard to visualize the newly implemented Analytics APIs.

## Tech Stack
* **Framework**: React.js (Next.js or Vite)
* **Visualization Library**: `recharts` (for high-performance SVG charting)
* **Mapping Engine**: `leaflet` OR `react-simple-maps` (static visualization, strictly no live camera linkage).
* **State Management**: React Query (TanStack Query) for auto-refetching and caching.

## Component Hierarchy Structure

```text
src/
├── components/
│   ├── analytics/
│   │   ├── TrendLineChart.tsx        # Consumes /api/admin/analytics/reports-trend
│   │   ├── StatusPieChart.tsx        # Consumes /api/admin/analytics/status-ratio
│   │   ├── ViolationBarChart.tsx     # Consumes /api/admin/analytics/violation-types
│   │   ├── OfficerMetricsTable.tsx   # Consumes /api/admin/analytics/officers
│   │   └── HeatmapOverlay.tsx        # Consumes /api/admin/analytics/heatmap
│   ├── ui/
│   │   ├── MetricCard.tsx            # Displays generic KPI blocks (Total Reports, Avg AI Confidence)
│   │   └── CsvExportButton.tsx       # Triggers downloads from /api/admin/export/*
└── pages/
    ├── DashboardPage.tsx             # Main assembly container
    └── ExportHubPage.tsx             # Dedicated full-page data extraction utility
```

## Component Implementation Details

### 1. `DashboardPage.tsx`
This acts as the Smart Container. It triggers `useQuery` hooks to fetch all analytical payloads concurrently. It passes the resulting arrays down into purely presentational charts.

### 2. `TrendLineChart.tsx`
* **Library**: `<LineChart data={trendData}>` from `recharts`.
* **Mapping**: X-Axis is the Date (or Month), Y-Axis is the raw report count.
* **Purpose**: Identifies temporal spikes in traffic violations (e.g., weekends vs weekdays).

### 3. `StatusPieChart.tsx`
* **Library**: `<PieChart>` from `recharts`.
* **Colors**: `VALIDATED` -> #10B981 (Green), `REJECTED` -> #EF4444 (Red), `SUBMITTED` -> #F59E0B (Amber).
* **Purpose**: Tracks platform signal-to-noise ratio.

### 4. `HeatmapOverlay.tsx`
* **Strategy**: The API explicitly rounds coordinates to 3 decimal places server-side.
* **Rendering**: Given an array of `{lat, lng, weight}`, the component should render translucent red circular SVG gradients over a static map image of Sri Lanka. 
* **Crucial Rule**: To adhere to ethical non-surveillance requirements, there must be NO real-time dot animation and NO individual unit tracking. It is a static historical aggregate visualization.

### 5. `CsvExportButton.tsx`
* **Implementation**: Standard `fetch` request utilizing URL `window.URL.createObjectURL(blob)` to force a `Content-Disposition` file download without opening a new tab.
