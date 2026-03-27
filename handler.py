
    1,   1: """
    2,   2: AR Performance Dashboard — Lambda Data Refresh
-   3     : Queries Andes Redshift tables and writes JSON to S3 for the frontend.
-   4     : Schedule: Daily via EventBridge (or more frequently if needed).
+        3: Queries Andes Redshift and writes dashboard JSON to S3.
+        4: Trigger: EventBridge daily schedule.
    5,   5: """
    6,   6: import json, os, boto3, psycopg2
-   7     : from datetime import datetime, timedelta
+        7: from datetime import datetime
    8,   8: from decimal import Decimal
    9,   9: 
   10,  10: BUCKET = os.environ["S3_BUCKET"]
   11,  11: S3_KEY = os.environ.get("S3_KEY", "ar-dashboard/latest.json")
   12,  12: WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "PHX6")
-  13     : MARKETPLACE_ID = int(os.environ.get("MARKETPLACE_ID", "1"))
-  14     : 
-  15     : # Redshift connection from env or Secrets Manager
-  16     : def get_connection():
-  17     :     secret_arn = os.environ.get("REDSHIFT_SECRET_ARN")
-  18     :     if secret_arn:
-  19     :         sm = boto3.client("secretsmanager")
-  20     :         creds = json.loads(sm.get_secret_value(SecretId=secret_arn)["SecretString"])
-  21     :         return psycopg2.connect(
-  22     :             host=creds["host"], port=creds.get("port", 5439),
-  23     :             dbname=creds.get("dbname", "andes"),
-  24     :             user=creds["username"], password=creds["password"],
-  25     :         )
-  26     :     return psycopg2.connect(
-  27     :         host=os.environ["REDSHIFT_HOST"], port=int(os.environ.get("REDSHIFT_PORT", 5439)),
-  28     :         dbname=os.environ.get("REDSHIFT_DB", "andes"),
-  29     :         user=os.environ["REDSHIFT_USER"], password=os.environ["REDSHIFT_PASS"],
-  30     :     )
+       13: MKT = int(os.environ.get("MARKETPLACE_ID", "1"))
   31,  14: 
   32,  15: 
   33,  16: class DecimalEncoder(json.JSONEncoder):
   34,  17:     def default(self, o):
-  35     :         if isinstance(o, Decimal):
-  36     :             return float(o)
-  37     :         return super().default(o)
+       18:         return float(o) if isinstance(o, Decimal) else super().default(o)
   38,  19: 
   39,  20: 
-  40     : def query(cur, sql, params=None):
-  41     :     cur.execute(sql, params or {})
+       21: def get_conn():
+       22:     secret_arn = os.environ.get("REDSHIFT_SECRET_ARN")
+       23:     if secret_arn:
+       24:         sm = boto3.client("secretsmanager")
+       25:         c = json.loads(sm.get_secret_value(SecretId=secret_arn)["SecretString"])
+       26:         return psycopg2.connect(host=c["host"], port=c.get("port", 5439),
+       27:                                 dbname=c.get("dbname", "andes"),
+       28:                                 user=c["username"], password=c["password"])
+       29:     return psycopg2.connect(host=os.environ["REDSHIFT_HOST"],
+       30:                             port=int(os.environ.get("REDSHIFT_PORT", 5439)),
+       31:                             dbname=os.environ.get("REDSHIFT_DB", "andes"),
+       32:                             user=os.environ["REDSHIFT_USER"],
+       33:                             password=os.environ["REDSHIFT_PASS"])
+       34: 
+       35: 
+       36: def q(cur, sql, p=None):
+       37:     cur.execute(sql, p or {})
   42,  38:     cols = [d[0] for d in cur.description]
   43,  39:     return [dict(zip(cols, row)) for row in cur.fetchall()]
   44,  40: 
   45,  41: 
+       42: P = {"mkt": MKT, "wh": WAREHOUSE_ID}
+       43: 
+       44: 
   46,  45: def fetch_yield_trend(cur):
-  47     :     """12-week yield PtP trend (weekly)."""
-  48     :     return query(cur, """
+       46:     return q(cur, """
   49,  47:         SELECT TO_CHAR(DATE_TRUNC('week', evaluation_day_lcl), 'MM/DD') AS week_label,
-  50     :                MIN(evaluation_day_lcl) AS week_start,
-  51     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(ma_op2_sellable_cogs), 0), 4) AS ptp,
-  52     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(cost), 0) * 100, 2) AS flat_yield_dollar,
-  53     :                ROUND(SUM(sellable_units)::FLOAT / NULLIF(SUM(sellable_units + unsellable_units), 0) * 100, 2) AS flat_yield_unit,
-  54     :                SUM(cost - cost_sellable) AS cost_unsellable,
+       48:                ROUND(SUM(cost_sellable)/NULLIF(SUM(ma_op2_sellable_cogs),0),4) AS ptp,
+       49:                ROUND(SUM(cost_sellable)/NULLIF(SUM(cost),0)*100,2) AS flat_yield_dollar,
+       50:                ROUND(SUM(sellable_units)::FLOAT/NULLIF(SUM(sellable_units+unsellable_units),0)*100,2) AS flat_yield_unit,
+       51:                SUM(cost-cost_sellable) AS cost_unsellable,
   55,  52:                SUM(cost_sellable) AS sellable_cogs,
   56,  53:                SUM(cost) AS graded_cogs,
   57,  54:                SUM(ma_op2_sellable_cogs) AS plan_cogs,
-  58     :                SUM(ma_op2_sellable_cogs) - SUM(cost_sellable) AS opp_cogs,
+       55:                SUM(ma_op2_sellable_cogs)-SUM(cost_sellable) AS opp_cogs,
   59,  56:                SUM(sellable_units) AS sellable_units,
   60,  57:                SUM(unsellable_units) AS unsellable_units
   61,  58:         FROM andes.rr_metrics.d_aw_yield_ptp
-  62     :         WHERE marketplace_id = %(mkt)s AND metric = 'aw_yield' AND channel = 'RETAIL'
-  63     :           AND warehouse_id = %(wh)s
-  64     :           AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '84 days'
-  65     :         GROUP BY 1, DATE_TRUNC('week', evaluation_day_lcl)
+       59:         WHERE marketplace_id=%(mkt)s AND metric='aw_yield' AND channel='RETAIL'
+       60:           AND warehouse_id=%(wh)s AND evaluation_day_lcl>=CURRENT_DATE-84
+       61:         GROUP BY 1,DATE_TRUNC('week',evaluation_day_lcl)
   66,  62:         ORDER BY MIN(evaluation_day_lcl)
-  67     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
+       63:     """, P)
   68,  64: 
   69,  65: 
   70,  66: def fetch_daily_ptp(cur):
-  71     :     """Daily PtP for the most recent 8 days."""
-  72     :     return query(cur, """
-  73     :         SELECT TO_CHAR(evaluation_day_lcl, 'MM/DD') AS day_label,
-  74     :                evaluation_day_lcl,
-  75     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(ma_op2_sellable_cogs), 0), 4) AS ptp
+       67:     return q(cur, """
+       68:         SELECT TO_CHAR(evaluation_day_lcl,'MM/DD') AS day_label,
+       69:                ROUND(SUM(cost_sellable)/NULLIF(SUM(ma_op2_sellable_cogs),0),4) AS ptp
   76,  70:         FROM andes.rr_metrics.d_aw_yield_ptp
-  77     :         WHERE marketplace_id = %(mkt)s AND metric = 'aw_yield' AND channel = 'RETAIL'
-  78     :           AND warehouse_id = %(wh)s
-  79     :           AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '10 days'
-  80     :         GROUP BY 1, 2 ORDER BY 2
-  81     :         LIMIT 8
-  82     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
+       71:         WHERE marketplace_id=%(mkt)s AND metric='aw_yield' AND channel='RETAIL'
+       72:           AND warehouse_id=%(wh)s AND evaluation_day_lcl>=CURRENT_DATE-10
+       73:         GROUP BY 1,evaluation_day_lcl ORDER BY evaluation_day_lcl LIMIT 8
+       74:     """, P)
   83,  75: 
   84,  76: 
-  85     : def fetch_gl_categories(cur):
-  86     :     """GL category breakdown for the most recent week."""
-  87     :     return query(cur, """
+       77: def fetch_gl(cur):
+       78:     return q(cur, """
   88,  79:         SELECT gl_product_group AS name,
-  89     :                SUM(sellable_units + unsellable_units) AS units,
-  90     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(cost), 0), 4) AS actual_yield,
-  91     :                ROUND(SUM(ma_op2_sellable_cogs) / NULLIF(SUM(cost), 0), 4) AS expected_yield,
-  92     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(ma_op2_sellable_cogs), 0), 4) AS ptp,
-  93     :                SUM(cost_sellable) AS sellable_cogs,
-  94     :                SUM(ma_op2_sellable_cogs) - SUM(cost_sellable) AS opp_cogs
+       80:                SUM(sellable_units+unsellable_units) AS units,
+       81:                ROUND(SUM(cost_sellable)/NULLIF(SUM(cost),0),4) AS actual_yield,
+       82:                ROUND(SUM(ma_op2_sellable_cogs)/NULLIF(SUM(cost),0),4) AS expected_yield,
+       83:                ROUND(SUM(cost_sellable)/NULLIF(SUM(ma_op2_sellable_cogs),0),4) AS ptp,
+       84:                SUM(ma_op2_sellable_cogs)-SUM(cost_sellable) AS opp_cogs
   95,  85:         FROM andes.rr_metrics.d_aw_yield_ptp
-  96     :         WHERE marketplace_id = %(mkt)s AND metric = 'aw_yield' AND channel = 'RETAIL'
-  97     :           AND warehouse_id = %(wh)s
-  98     :           AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '7 days'
-  99     :         GROUP BY 1
- 100     :         HAVING SUM(sellable_units + unsellable_units) > 0
- 101     :         ORDER BY units DESC
- 102     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
- 103     : 
- 104     : 
- 105     : def fetch_cr_ar_comparison(cur):
- 106     :     """5-week CR vs AR comparison."""
- 107     :     return query(cur, """
- 108     :         WITH weekly AS (
- 109     :             SELECT DATE_TRUNC('week', evaluation_day_lcl) AS wk,
- 110     :                    metric,
- 111     :                    SUM(cost_sellable) AS sell_cogs, SUM(cost) AS tot_cogs,
- 112     :                    SUM(ma_op2_sellable_cogs) AS plan_cogs,
- 113     :                    SUM(sellable_units) AS sell_u,
- 114     :                    SUM(sellable_units + unsellable_units) AS tot_u,
- 115     :                    SUM(ma_op2_sellable_units) AS plan_u
- 116     :             FROM andes.rr_metrics.d_aw_yield_ptp
- 117     :             WHERE marketplace_id = %(mkt)s AND channel = 'RETAIL'
- 118     :               AND warehouse_id = %(wh)s
- 119     :               AND metric IN ('aw_yield')
- 120     :               AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '35 days'
- 121     :             GROUP BY 1, 2
- 122     :         )
- 123     :         SELECT TO_CHAR(wk, 'MM/DD') AS week_label,
- 124     :                ROUND(sell_cogs / NULLIF(plan_cogs, 0), 4) AS ar_ptp_dollar,
- 125     :                ROUND(sell_cogs / NULLIF(tot_cogs, 0) * 100, 2) AS ar_flat_yield_dollar,
- 126     :                ROUND(sell_u::FLOAT / NULLIF(tot_u, 0) * 100, 2) AS ar_flat_yield_unit,
- 127     :                plan_cogs - sell_cogs AS ar_opp_cogs
- 128     :         FROM weekly
- 129     :         ORDER BY wk
- 130     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
+       86:         WHERE marketplace_id=%(mkt)s AND metric='aw_yield' AND channel='RETAIL'
+       87:           AND warehouse_id=%(wh)s AND evaluation_day_lcl>=CURRENT_DATE-7
+       88:         GROUP BY 1 HAVING SUM(sellable_units+unsellable_units)>0 ORDER BY units DESC
+       89:     """, P)
  131,  90: 
  132,  91: 
  133,  92: def fetch_associates(cur):
- 134     :     """Associate-level performance for the most recent week."""
- 135     :     return query(cur, """
- 136     :         SELECT grading_associate_id AS login,
- 137     :                grading_manager_id AS manager,
- 138     :                SUM(sellable_units + unsellable_units) AS units,
- 139     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(ma_op2_sellable_cogs), 0), 4) AS ptp,
- 140     :                ROUND(SUM(sellable_units)::FLOAT / NULLIF(SUM(sellable_units + unsellable_units), 0), 4) AS success_rate
+       93:     return q(cur, """
+       94:         SELECT grading_associate_id AS login, grading_manager_id AS manager,
+       95:                SUM(sellable_units+unsellable_units) AS units,
+       96:                ROUND(SUM(cost_sellable)/NULLIF(SUM(ma_op2_sellable_cogs),0),4) AS ptp,
+       97:                ROUND(SUM(sellable_units)::FLOAT/NULLIF(SUM(sellable_units+unsellable_units),0),4) AS success_rate
  141,  98:         FROM andes.rr_metrics.d_aw_yield_ptp
- 142     :         WHERE marketplace_id = %(mkt)s AND metric = 'aw_yield' AND channel = 'RETAIL'
- 143     :           AND warehouse_id = %(wh)s
- 144     :           AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '7 days'
+       99:         WHERE marketplace_id=%(mkt)s AND metric='aw_yield' AND channel='RETAIL'
+      100:           AND warehouse_id=%(wh)s AND evaluation_day_lcl>=CURRENT_DATE-7
  145, 101:           AND grading_associate_id IS NOT NULL
- 146     :         GROUP BY 1, 2
- 147     :         HAVING SUM(sellable_units + unsellable_units) >= 10
- 148     :         ORDER BY ptp DESC
- 149     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
+      102:         GROUP BY 1,2 HAVING SUM(sellable_units+unsellable_units)>=10 ORDER BY ptp DESC
+      103:     """, P)
  150, 104: 
  151, 105: 
  152, 106: def fetch_site_trend(cur):
- 153     :     """5-week site-level trend."""
- 154     :     return query(cur, """
- 155     :         SELECT TO_CHAR(DATE_TRUNC('week', evaluation_day_lcl), 'MM/DD') AS week_label,
- 156     :                ROUND(SUM(cost_sellable) / NULLIF(SUM(ma_op2_sellable_cogs), 0), 4) AS refurb_ptp,
- 157     :                ROUND(SUM(sellable_units)::FLOAT / NULLIF(SUM(sellable_units + unsellable_units), 0), 4) AS success_rate
+      107:     return q(cur, """
+      108:         SELECT TO_CHAR(DATE_TRUNC('week',evaluation_day_lcl),'MM/DD') AS week_label,
+      109:                ROUND(SUM(cost_sellable)/NULLIF(SUM(ma_op2_sellable_cogs),0),4) AS refurb_ptp,
+      110:                ROUND(SUM(sellable_units)::FLOAT/NULLIF(SUM(sellable_units+unsellable_units),0),4) AS success_rate
  158, 111:         FROM andes.rr_metrics.d_aw_yield_ptp
- 159     :         WHERE marketplace_id = %(mkt)s AND metric = 'aw_yield' AND channel = 'RETAIL'
- 160     :           AND warehouse_id = %(wh)s
- 161     :           AND evaluation_day_lcl >= CURRENT_DATE - INTERVAL '35 days'
- 162     :         GROUP BY 1, DATE_TRUNC('week', evaluation_day_lcl)
+      112:         WHERE marketplace_id=%(mkt)s AND metric='aw_yield' AND channel='RETAIL'
+      113:           AND warehouse_id=%(wh)s AND evaluation_day_lcl>=CURRENT_DATE-35
+      114:         GROUP BY 1,DATE_TRUNC('week',evaluation_day_lcl)
  163, 115:         ORDER BY MIN(evaluation_day_lcl)
- 164     :     """, {"mkt": MARKETPLACE_ID, "wh": WAREHOUSE_ID})
+      116:     """, P)
  165, 117: 
  166, 118: 
- 167     : def fetch_concessions(cur):
- 168     :     """Concession rate (8-week lag applied)."""
- 169     :     return query(cur, """
- 170     :         SELECT TO_CHAR(DATE_TRUNC('month', ship_day), 'YYYY-MM') AS month_label,
- 171     :                ROUND(SUM(conc_units_wbr_all)::FLOAT / NULLIF(SUM(ship_units_wbr), 0) * 100, 4) AS concession_rate,
- 172     :                SUM(ship_units_wbr) AS shipped_units,
- 173     :                SUM(conc_units_wbr_all) AS conceded_units
- 174     :         FROM andes.wdmetrics_serv.ta_whd_concessions
- 175     :         WHERE marketplace_id = %(mkt)s
- 176     :           AND ship_day < CURRENT_DATE - INTERVAL '56 days'
- 177     :           AND ship_day >= CURRENT_DATE - INTERVAL '180 days'
- 178     :         GROUP BY 1 ORDER BY 1
- 179     :     """, {"mkt": MARKETPLACE_ID})
- 180     : 
- 181     : 
- 182     : def compute_kpis(trend, gl_data, associates):
- 183     :     """Derive top-level KPIs from query results."""
+      119: def compute_kpis(trend, gl):
  184, 120:     if not trend:
  185, 121:         return {}
- 186     :     latest = trend[-1]
- 187     :     prev = trend[-2] if len(trend) > 1 else latest
- 188     :     first = trend[0]
- 189     : 
- 190     :     ptp_now = latest.get("ptp") or 0
- 191     :     ptp_prev = prev.get("ptp") or 0
- 192     :     ptp_first = first.get("ptp") or 0
- 193     :     wow_chg = ((ptp_now - ptp_prev) / ptp_prev * 100) if ptp_prev else 0
- 194     :     decline_12w = ((ptp_now - ptp_first) / ptp_first * 100) if ptp_first else 0
- 195     : 
- 196     :     # Weeks until breach at current decline rate
- 197     :     weeks_count = len(trend)
- 198     :     weekly_decline = (ptp_first - ptp_now) / weeks_count if weeks_count > 1 else 0
- 199     :     weeks_to_breach = ((ptp_now - 1.0) / weekly_decline) if weekly_decline > 0 else None
- 200     : 
- 201     :     gl_above = sum(1 for g in gl_data if (g.get("ptp") or 0) >= 1.0)
- 202     :     gl_below = sum(1 for g in gl_data if (g.get("ptp") or 0) < 1.0)
- 203     :     worst_gl = min(gl_data, key=lambda g: g.get("ptp") or 999) if gl_data else {}
- 204     : 
+      122:     cur, prev, first = trend[-1], trend[-2] if len(trend) > 1 else trend[-1], trend[0]
+      123:     ptp_now, ptp_prev, ptp_first = cur["ptp"] or 0, prev["ptp"] or 0, first["ptp"] or 0
+      124:     wow = ((ptp_now - ptp_prev) / ptp_prev * 100) if ptp_prev else 0
+      125:     dec = ((ptp_now - ptp_first) / ptp_first * 100) if ptp_first else 0
+      126:     wd = (ptp_first - ptp_now) / len(trend) if len(trend) > 1 else 0
+      127:     wtb = ((ptp_now - 1.0) / wd) if wd > 0 else None
+      128:     gl_above = sum(1 for g in gl if (g["ptp"] or 0) >= 1.0)
+      129:     gl_below = len(gl) - gl_above
+      130:     worst = min(gl, key=lambda g: g["ptp"] or 999) if gl else {}
  205, 131:     return {
- 206     :         "yieldPtp": ptp_now,
- 207     :         "yieldPtpWow": round(wow_chg, 1),
- 208     :         "arOppCogs": latest.get("opp_cogs") or 0,
+      132:         "yieldPtp": ptp_now, "yieldPtpWow": round(wow, 1),
+      133:         "arOppCogs": cur.get("opp_cogs") or 0,
  209, 134:         "arOppCogsPrev": prev.get("opp_cogs") or 0,
- 210     :         "decline12wk": round(decline_12w, 1),
- 211     :         "weeksToBreach": round(weeks_to_breach, 1) if weeks_to_breach else None,
- 212     :         "flatYieldDollar": latest.get("flat_yield_dollar") or 0,
- 213     :         "flatYieldUnit": latest.get("flat_yield_unit") or 0,
- 214     :         "glAbove": gl_above,
- 215     :         "glBelow": gl_below,
- 216     :         "glTotal": gl_above + gl_below,
- 217     :         "worstGl": worst_gl.get("name", "N/A"),
- 218     :         "worstGlPtp": worst_gl.get("ptp", 0),
+      135:         "decline12wk": round(dec, 1),
+      136:         "weeksToBreach": round(wtb, 1) if wtb else None,
+      137:         "flatYieldDollar": cur.get("flat_yield_dollar") or 0,
+      138:         "flatYieldUnit": cur.get("flat_yield_unit") or 0,
+      139:         "glAbove": gl_above, "glBelow": gl_below, "glTotal": len(gl),
+      140:         "worstGl": worst.get("name", "N/A"), "worstGlPtp": worst.get("ptp", 0),
  219, 141:     }
  220, 142: 
  221, 143: 
  222, 144: def handler(event, context):
- 223     :     conn = get_connection()
+      145:     conn = get_conn()
  224, 146:     cur = conn.cursor()
- 225     : 
  226, 147:     try:
  227, 148:         trend = fetch_yield_trend(cur)
- 228     :         daily = fetch_daily_ptp(cur)
- 229     :         gl_data = fetch_gl_categories(cur)
- 230     :         comparison = fetch_cr_ar_comparison(cur)
- 231     :         associates = fetch_associates(cur)
- 232     :         site_trend = fetch_site_trend(cur)
- 233     :         concessions = fetch_concessions(cur)
- 234     : 
- 235     :         kpis = compute_kpis(trend, gl_data, associates)
- 236     : 
+      149:         gl = fetch_gl(cur)
  237, 150:         payload = {
  238, 151:             "lastUpdated": datetime.utcnow().isoformat() + "Z",
- 239     :             "warehouseId": WAREHOUSE_ID,
- 240     :             "marketplaceId": MARKETPLACE_ID,
- 241     :             "kpis": kpis,
+      152:             "warehouseId": WAREHOUSE_ID, "marketplaceId": MKT,
+      153:             "kpis": compute_kpis(trend, gl),
  242, 154:             "yieldTrend": trend,
- 243     :             "dailyPtp": daily,
- 244     :             "glCategories": gl_data,
- 245     :             "crArComparison": comparison,
- 246     :             "associates": associates,
- 247     :             "siteTrend": site_trend,
- 248     :             "concessions": concessions,
+      155:             "dailyPtp": fetch_daily_ptp(cur),
+      156:             "glCategories": gl,
+      157:             "associates": fetch_associates(cur),
+      158:             "siteTrend": fetch_site_trend(cur),
  249, 159:         }
- 250     : 
- 251     :         s3 = boto3.client("s3")
- 252     :         s3.put_object(
+      160:         boto3.client("s3").put_object(
  253, 161:             Bucket=BUCKET, Key=S3_KEY,
  254, 162:             Body=json.dumps(payload, cls=DecimalEncoder),
- 255     :             ContentType="application/json",
- 256     :             CacheControl="max-age=1800",
- 257     :         )
+      163:             ContentType="application/json", CacheControl="max-age=1800")
  258, 164:         return {"statusCode": 200, "body": f"Updated {S3_KEY}"}
- 259     : 
  260, 165:     finally:
  261, 166:         cur.close()
  262, 167:         conn.close()

