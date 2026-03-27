
+     1: # PHX6 AR Performance Dashboard
+     2: 
+     3: Live-updating AR Yield & Concessions dashboard powered by Redshift (Andes) → S3 JSON → static HTML.
+     4: 
+     5: ## Architecture
+     6: 
+     7: ```
+     8: Redshift (Andes)  →  Lambda (scheduled)  →  S3 (JSON)  →  index.html (fetches JSON)
+     9: ```
+    10: 
+    11: ## Files
+    12: 
+    13: | File | Purpose |
+    14: |------|---------|
+    15: | `index.html` | Dashboard frontend (self-contained, no build step) |
+    16: | `lambda/handler.py` | Queries Redshift, writes JSON to S3 |
+    17: | `lambda/requirements.txt` | Python dependencies for Lambda |
+    18: | `infra/deploy.sh` | Creates S3 bucket, Lambda, and EventBridge schedule |
+    19: 
+    20: ## Quick Start
+    21: 
+    22: 1. Open `index.html` in a browser — works immediately with hardcoded fallback data
+    23: 2. Deploy the Lambda to start getting live data (see `infra/deploy.sh`)
+    24: 3. Update `DATA_URL` in `index.html` to point to your S3 bucket
+    25: 
+    26: ## Data Sources
+    27: 
+    28: | Table | Schema | Purpose |
+    29: |-------|--------|---------|
+    30: | `d_aw_yield_ptp` | `andes.rr_metrics` | AR Yield detail with PtP |
+    31: | `a_aw_yield_ptp` | `andes.rr_metrics` | AR Yield aggregated |
+    32: | `ta_whd_concessions` | `andes.wdmetrics_serv` | AR Concessions |
+    33: | `warehouse_site_type_map` | `andes.rr_internal` | Site mapping |

Creating: /workspace/ar-dashboard/README.md
