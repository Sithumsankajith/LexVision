# LexVision Database Performance Optimization Plan

Handling thousands of traffic violation records and analytical calculations places significant stress on the relational database. This document formalizes the optimization strategy ensuring the Analytics Dashboard runs seamlessly at scale.

## 1. Multi-Tier Caching System (Redis)
* **Problem**: Aggregation queries like `func.avg()` and `func.count() GROUP BY` heavily lock sequential tables. Running this every time an admin lands on the dashboard is O(N) expensive.
* **Solution**: The API layer in `admin.py` utilizes a custom `@cached(ttl=300)` explicit decorator.
  * API endpoints hash their string signature (e.g., `lexvision_analytics:get_reports_trend`).
  * If the key exists in Redis memory, the JSON payload is returned in < 5ms.
  * If the key expires, PostgreSQL computes it once, and Redis holds it for another 5 minutes (300 seconds). Heatmap data is explicitly cached for 10 minutes (600s).

## 2. Streaming Response Export
* **Problem**: Selecting 100,000 rows into RAM to generate an Analytics CSV file will cause the Python API process to hit `MemoryError` limits.
* **Solution**: The `/export/reports` endpoint utilizes FastAPI's native `StreamingResponse`. Instead of loading the entire `List[Report]` array into memory, it uses Python generators (`yield`) alongside SQLAlchemy `.yield_per()` internally to stream chunks over HTTP dynamically.

## 3. Database Indexing Strategy
* **Implementation Status**: B-Tree Indexes were established on core tables during the monolithic architecture refactoring phase.
* **Critical Queries**:
  * `CREATE INDEX idx_report_status ON reports(status);` -> Accelerates `status-ratio` and `heatmap` filtering.
  * `CREATE INDEX idx_report_datetime ON reports(datetime);` -> Accelerates purely time-bounded trending queries.
  * `CREATE INDEX idx_report_user ON reports(user_id);` -> Accelerates officer performance metrics.

## 4. Future Scalability: Materialized Views (PostgreSQL specific)
If the project shifts entirely to PostgreSQL for production deployment beyond the scope of a standard relational framework, the daily trend aggregations should be pushed strictly to the Database Engine via Materialized Views:

```sql
CREATE MATERIALIZED VIEW daily_trend_mv AS
SELECT DATE_TRUNC('day', datetime) as date, COUNT(id) as counts
FROM reports
GROUP BY 1;
```
This restricts the Python API entirely to a simple `SELECT * FROM daily_trend_mv`, offloading computational overhead and recalculating the view nightly via pg_cron.
