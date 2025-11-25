# GetFit AI – Grafana Dashboards

This folder contains all auto-provisioned dashboards used for observing the
GetFit AI backend services.  
Dashboard JSON files are kept clean because Grafana does not accept comments
inside dashboard definitions.

Each file below includes a short explanation of the metrics, purpose,
and the systems it monitors.

---

## 1. getfit_ai_backend_metrics.json

### Purpose
Deep-dive dashboard for backend internals.  
Used by developers when debugging API performance, cache behavior,
BullMQ queues, and Node.js runtime characteristics.

### Key Sections
- **Redis Cache Metrics**
  - Hit/miss rates
  - Long-term hit ratio
- **BullMQ Queue Metrics**
  - Completed/failed job rates
  - Active job count
- **OpenAI Metrics**
  - p95 latency from histogram buckets
- **HTTP Metrics**
  - Requests per route, per status code
- **Node.js Runtime**
  - Heap usage (MB)
  - Event loop lag (sec)

### Datasource
Uses the `prometheus` datasource UID defined in provisioning.

---

## 2. getfit_ai_dashboard.json

### Purpose
High-level system overview used for daily monitoring.
Focused on quick-glance metrics rather than deep debugging.

### Key Metrics
- Heap memory usage
- Resident memory (RSS)
- Event loop lag
- Average OpenAI latency
- Redis hit ratio
- Requests per second

### Usage
Best for real-time sanity checks during deployments, rollouts,
latency investigations, and performance tuning.

---

## 3. getfit_health_overview.json

### Purpose
Primary health and alerting dashboard.  
This is the one used for alert rules in Grafana.

### Contains Alerts For
- Redis hit ratio dropping below threshold
- OpenAI latency exceeding limits
- BullMQ job failures
- Node.js heap usage > threshold
- Event loop lag > threshold

### Special Notes
- Links to the backend metrics dashboard for diagnostics
- Covers the last 6 hours by default for trend visibility

---

## Dashboard Provisioning Notes

Dashboards in this folder are auto-loaded by Grafana using the
following configuration:

`provisioning/dashboards/dashboards.yaml`

```yaml
options:
  path: /var/lib/grafana/dashboards