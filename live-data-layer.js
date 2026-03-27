+      1: /**
+      2:  * AR Dashboard — Live Data Layer
+      3:  * Drop this script into your existing HTML (before the chart-rendering scripts).
+      4:  * It fetches JSON from S3 and exposes window.LIVE_DATA for all chart functions.
+      5:  *
+      6:  * Usage: Set DATA_URL below to your S3 JSON endpoint.
+      7:  * Fallback: If fetch fails, charts render with the original hardcoded data.
+      8:  */
+      9: (function () {
+     10:   'use strict';
+     11: 
+     12:   // ── CONFIG ──────────────────────────────────────────────────────────
+     13:   var DATA_URL = 'https://YOUR-BUCKET.s3.amazonaws.com/ar-dashboard/latest.json';
+     14:   var REFRESH_MS = 30 * 60 * 1000; // 30 minutes
+     15:   var STATUS_EL_ID = 'data-status';
+     16: 
+     17:   // ── STATE ───────────────────────────────────────────────────────────
+     18:   window.LIVE_DATA = null;
+     19:   window.DATA_LOADED = false;
+     20: 
+     21:   // ── FETCH & RENDER ──────────────────────────────────────────────────
+     22:   function loadData() {
+     23:     fetch(DATA_URL)
+     24:       .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
+     25:       .then(function (data) {
+     26:         window.LIVE_DATA = data;
+     27:         window.DATA_LOADED = true;
+     28:         updateStatus('Live — ' + new Date(data.lastUpdated).toLocaleString());
+     29:         renderFromLiveData(data);
+     30:       })
+     31:       .catch(function (err) {
+     32:         console.warn('Live data unavailable, using hardcoded fallback:', err);
+     33:         updateStatus('Offline — using cached data');
+     34:       });
+     35:   }
+     36: 
+     37:   function updateStatus(msg) {
+     38:     var el = document.getElementById(STATUS_EL_ID);
+     39:     if (el) el.textContent = msg;
+     40:   }
+     41: 
+     42:   // ── KPI UPDATER ─────────────────────────────────────────────────────
+     43:   function setKpi(selector, value, sub, subClass) {
+     44:     var els = document.querySelectorAll(selector);
+     45:     els.forEach(function (el) {
+     46:       var valEl = el.querySelector('.kpi-value');
+     47:       var subEl = el.querySelector('.kpi-sub');
+     48:       if (valEl && value !== undefined) valEl.textContent = value;
+     49:       if (subEl && sub !== undefined) {
+     50:         subEl.textContent = sub;
+     51:         if (subClass) subEl.className = 'kpi-sub ' + subClass;
+     52:       }
+     53:     });
+     54:   }
+     55: 
+     56:   // ── MAIN RENDER ─────────────────────────────────────────────────────
+     57:   function renderFromLiveData(d) {
+     58:     var k = d.kpis || {};
+     59: 
+     60:     // Update sidebar subtitle
+     61:     var sub = document.querySelector('.sidebar .subtitle');
+     62:     if (sub) sub.textContent = d.warehouseId + ' • Updated ' +
+     63:       new Date(d.lastUpdated).toLocaleDateString();
+     64: 
+     65:     // ── Tab 1: Overview KPIs ──
+     66:     updateOverviewKpis(k);
+     67: 
+     68:     // ── Tab 1: 12-week yield trend chart ──
+     69:     if (d.yieldTrend && d.yieldTrend.length) renderYieldTrendChart(d.yieldTrend);
+     70: 
+     71:     // ── Tab 1: Daily PtP chart ──
+     72:     if (d.dailyPtp && d.dailyPtp.length) renderDailyPtpChart(d.dailyPtp);
+     73: 
+     74:     // ── Tab 1: CR/AR comparison table ──
+     75:     if (d.crArComparison && d.crArComparison.length) renderComparisonTable(d.crArComparison);
+     76: 
+     77:     // ── Tab 2: GL categories ──
+     78:     if (d.glCategories && d.glCategories.length) {
+     79:       renderGlBarChart(d.glCategories);
+     80:       renderGlBubbleChart(d.glCategories);
+     81:       renderGlTable(d.glCategories);
+     82:       updateGlKpis(k, d.glCategories);
+     83:     }
+     84: 
+     85:     // ── Tab 3: Associates ──
+     86:     if (d.associates && d.associates.length) renderAssociateScatter(d.associates);
+     87:     if (d.siteTrend && d.siteTrend.length) renderSiteTrendChart(d.siteTrend);
+     88: 
+     89:     // ── Tab 4: Divergence ──
+     90:     if (d.yieldTrend && d.yieldTrend.length) renderDivergenceCharts(d.yieldTrend);
+     91:   }
+     92: 
+     93:   // ── CHART HELPERS ───────────────────────────────────────────────────
+     94:   var PB = '#1a1d27', PG = '#2d3140', PF = { color: '#8b8fa3', family: 'Segoe UI,system-ui' };
+     95:   var BASE_LAYOUT = {
+     96:     plot_bgcolor: PB, paper_bgcolor: PB, font: PF,
+     97:     margin: { l: 60, r: 30, t: 40, b: 50 },
+     98:     xaxis: { gridcolor: PG, zerolinecolor: PG },
+     99:     yaxis: { gridcolor: PG, zerolinecolor: PG }
+    100:   };
+    101:   var CFG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] };
+    102: 
+    103:   function L(overrides) {
+    104:     return Object.assign({}, JSON.parse(JSON.stringify(BASE_LAYOUT)), overrides);
+    105:   }
+    106: 
+    107:   function breakLine(x0, x1, y) {
+    108:     return { type: 'line', x0: x0, x1: x1, y0: y, y1: y, line: { color: '#e74c3c', width: 2, dash: 'dash' } };
+    109:   }
+    110: 
+    111:   // ── CHART RENDERERS ─────────────────────────────────────────────────
+    112: 
+    113:   function updateOverviewKpis(k) {
+    114:     var kpis = document.querySelectorAll('#tab-overview .kpi');
+    115:     if (kpis.length < 5) return;
+    116:     // Yield PtP
+    117:     kpis[0].querySelector('.kpi-value').textContent = (k.yieldPtp || 0).toFixed(4);
+    118:     kpis[0].querySelector('.kpi-sub').textContent = (k.yieldPtpWow >= 0 ? '▲ ' : '▼ ') + Math.abs(k.yieldPtpWow) + '% WoW';
+    119:     // AR Yield PtP ($) — same as yield ptp for now
+    120:     kpis[1].querySelector('.kpi-value').textContent = (k.yieldPtp || 0).toFixed(4);
+    121:     // Opp COGs
+    122:     kpis[2].querySelector('.kpi-value').textContent = (k.arOppCogs >= 0 ? '+$' : '-$') + Math.abs(k.arOppCogs).toLocaleString();
+    123:     // 12-week decline
+    124:     kpis[3].querySelector('.kpi-value').textContent = k.decline12wk + '%';
+    125:     if (k.weeksToBreach) kpis[3].querySelector('.kpi-sub').textContent = '⚠️ Breach ~' + k.weeksToBreach + ' weeks';
+    126:   }
+    127: 
+    128:   function updateGlKpis(k, gl) {
+    129:     var kpis = document.querySelectorAll('#tab-gl .kpi');
+    130:     if (kpis.length < 4) return;
+    131:     kpis[0].querySelector('.kpi-value').textContent = k.glTotal || gl.length;
+    132:     kpis[1].querySelector('.kpi-value').textContent = k.glAbove || 0;
+    133:     kpis[2].querySelector('.kpi-value').textContent = k.glBelow || 0;
+    134:     kpis[3].querySelector('.kpi-value').textContent = k.worstGl || 'N/A';
+    135:     kpis[3].querySelector('.kpi-sub').textContent = (k.worstGlPtp || 0).toFixed(4) + ' PtP';
+    136:   }
+    137: 
+    138:   function renderYieldTrendChart(rows) {
+    139:     var weeks = rows.map(function (r) { return r.week_label; });
+    140:     var ptp = rows.map(function (r) { return r.ptp; });
+    141:     var cost = rows.map(function (r) { return (r.cost_unsellable || 0) / 1000; });
+    142:     var last = weeks[weeks.length - 1];
+    143:     var lastPtp = ptp[ptp.length - 1];
+    144: 
+    145:     Plotly.react('chart-yield-trend', [
+    146:       { x: weeks, y: ptp, name: 'Yield PtP', type: 'scatter', mode: 'lines+markers', line: { color: '#4a90e2', width: 3 }, marker: { size: 8 } },
+    147:       { x: weeks, y: cost, name: 'Cost Unsellable ($K)', type: 'bar', yaxis: 'y2', marker: { color: 'rgba(231,76,60,0.3)' }, hovertemplate: '$%{y:.0f}K' }
+    148:     ], L({
+    149:       title: { text: 'Yield PtP & Cost Unsellable', font: { size: 14, color: '#e2e4e9' } },
+    150:       yaxis: { title: 'Yield PtP', gridcolor: PG, range: [Math.min.apply(null, ptp) - 0.02, Math.max.apply(null, ptp) + 0.02] },
+    151:       yaxis2: { title: 'Cost Unsellable ($K)', overlaying: 'y', side: 'right', gridcolor: 'transparent' },
+    152:       shapes: [breakLine(weeks[0], last, 1.0)],
+    153:       annotations: [{ x: last, y: lastPtp, text: lastPtp.toFixed(4), showarrow: true, arrowhead: 2, ax: 40, ay: -30, font: { color: '#f39c12', size: 12 } }],
+    154:       showlegend: true, legend: { x: 0, y: 1.15, orientation: 'h' }
+    155:     }), CFG);
+    156:   }
+    157: 
+    158:   function renderDailyPtpChart(rows) {
+    159:     var days = rows.map(function (r) { return r.day_label; });
+    160:     var vals = rows.map(function (r) { return r.ptp; });
+    161:     var colors = vals.map(function (v) { return v >= 1.0 ? '#2ecc71' : '#e74c3c'; });
+    162: 
+    163:     Plotly.react('chart-daily-ptp', [{
+    164:       x: days, y: vals, type: 'bar', marker: { color: colors },
+    165:       text: vals.map(function (v) { return v.toFixed(4); }), textposition: 'outside', textfont: { color: '#e2e4e9', size: 11 }
+    166:     }], L({
+    167:       title: { text: 'Daily AR Yield PtP', font: { size: 14, color: '#e2e4e9' } },
+    168:       yaxis: { range: [Math.min.apply(null, vals) - 0.03, Math.max.apply(null, vals) + 0.05], gridcolor: PG },
+    169:       shapes: [breakLine(-0.5, rows.length - 0.5, 1.0)]
+    170:     }), CFG);
+    171:   }
+    172: 
+    173:   function renderComparisonTable(rows) {
+    174:     // Find the comparison table body in tab-overview
+    175:     var tables = document.querySelectorAll('#tab-overview table.data-table tbody');
+    176:     if (!tables.length) return;
+    177:     var tbody = tables[0];
+    178:     tbody.innerHTML = '';
+    179:     rows.forEach(function (r) {
+    180:       var tr = document.createElement('tr');
+    181:       var ptpColor = r.ar_ptp_dollar >= 1.03 ? 'var(--green)' : r.ar_ptp_dollar >= 1.0 ? 'var(--orange)' : 'var(--red)';
+    182:       tr.innerHTML =
+    183:         '<td>' + r.week_label + '</td>' +
+    184:         '<td>—</td><td>—</td><td>—</td>' +
+    185:         '<td style="color:' + ptpColor + '">' + (r.ar_ptp_dollar || 0).toFixed(4) + '</td>' +
+    186:         '<td style="color:' + ptpColor + '">$' + (r.ar_opp_cogs || 0).toLocaleString() + '</td>' +
+    187:         '<td>' + (r.ar_flat_yield_unit || 0).toFixed(2) + '%</td>' +
+    188:         '<td>' + (r.ar_flat_yield_dollar || 0).toFixed(2) + '%</td>';
+    189:       tbody.appendChild(tr);
+    190:     });
+    191:   }
+    192: 
+    193:   function renderGlBarChart(gl) {
+    194:     gl.sort(function (a, b) { return a.ptp - b.ptp; });
+    195:     var names = gl.map(function (g) { return g.name; });
+    196:     var ptps = gl.map(function (g) { return g.ptp; });
+    197:     var units = gl.map(function (g) { return g.units; });
+    198:     var colors = ptps.map(function (p) { return p >= 1.05 ? '#2ecc71' : p >= 1.0 ? '#f39c12' : p >= 0.9 ? '#e67e22' : '#e74c3c'; });
+    199: 
+    200:     Plotly.react('chart-gl-bar', [{
+    201:       y: names, x: ptps, type: 'bar', orientation: 'h', marker: { color: colors },
+    202:       text: ptps.map(function (p) { return p.toFixed(4); }), textposition: 'outside', textfont: { size: 10, color: '#e2e4e9' },
+    203:       customdata: units, hovertemplate: '%{y}<br>PtP: %{x:.4f}<br>Units: %{customdata:,}<extra></extra>'
+    204:     }], L({
+    205:       margin: { l: 160, r: 60, t: 30, b: 40 },
+    206:       xaxis: { range: [Math.min.apply(null, ptps) - 0.1, Math.max.apply(null, ptps) + 0.1], gridcolor: PG },
+    207:       yaxis: { automargin: true },
+    208:       shapes: [{ type: 'line', x0: 1.0, x1: 1.0, y0: -0.5, y1: gl.length - 0.5, line: { color: '#e74c3c', width: 2, dash: 'dash' } }]
+    209:     }), CFG);
+    210:   }
+    211: 
+    212:   function renderGlBubbleChart(gl) {
+    213:     var above = gl.filter(function (g) { return g.ptp >= 1.0; });
+    214:     var below = gl.filter(function (g) { return g.ptp < 1.0; });
+    215: 
+    216:     Plotly.react('chart-gl-bubble', [
+    217:       { x: above.map(function (g) { return g.units; }), y: above.map(function (g) { return g.ptp; }), text: above.map(function (g) { return g.name; }), mode: 'markers+text', textposition: 'top center', textfont: { size: 9, color: '#8b8fa3' }, marker: { size: above.map(function (g) { return Math.sqrt(g.units) / 4; }), color: 'rgba(46,204,113,0.6)', line: { color: '#2ecc71', width: 1 } }, name: 'Above 1.0' },
+    218:       { x: below.map(function (g) { return g.units; }), y: below.map(function (g) { return g.ptp; }), text: below.map(function (g) { return g.name; }), mode: 'markers+text', textposition: 'top center', textfont: { size: 9, color: '#e74c3c' }, marker: { size: below.map(function (g) { return Math.sqrt(g.units) / 4; }), color: 'rgba(231,76,60,0.6)', line: { color: '#e74c3c', width: 1 } }, name: 'Below 1.0' }
+    219:     ], L({
+    220:       xaxis: { title: 'Units', gridcolor: PG }, yaxis: { title: 'Yield PtP', gridcolor: PG },
+    221:       shapes: [breakLine(0, Math.max.apply(null, gl.map(function (g) { return g.units; })) * 1.1, 1.0)],
+    222:       showlegend: true, legend: { x: 0.7, y: 0.95 }
+    223:     }), CFG);
+    224:   }
+    225: 
+    226:   function renderGlTable(gl) {
+    227:     gl.sort(function (a, b) { return b.units - a.units; });
+    228:     var tbody = document.getElementById('gl-table-body');
+    229:     if (!tbody) return;
+    230:     tbody.innerHTML = '';
+    231:     gl.forEach(function (g) {
+    232:       var status = g.ptp >= 1.05 ? '<span class="badge badge-green">Strong</span>' :
+    233:         g.ptp >= 1.0 ? '<span class="badge badge-yellow">At Target</span>' :
+    234:         g.ptp >= 0.9 ? '<span class="badge badge-yellow">Below</span>' :
+    235:         '<span class="badge badge-red">Critical</span>';
+    236:       var gap = ((g.actual_yield - g.expected_yield) * 100).toFixed(2);
+    237:       var gapColor = gap >= 0 ? 'var(--green)' : 'var(--red)';
+    238:       var ptpColor = g.ptp >= 1.0 ? 'var(--green)' : 'var(--red)';
+    239:       var tr = document.createElement('tr');
+    240:       tr.innerHTML = '<td>' + status + '</td><td>' + g.name + '</td><td>' + g.units.toLocaleString() +
+    241:         '</td><td>' + (g.actual_yield * 100).toFixed(2) + '%</td><td>' + (g.expected_yield * 100).toFixed(2) +
+    242:         '%</td><td style="color:' + ptpColor + '"><strong>' + g.ptp.toFixed(4) +
+    243:         '</strong></td><td style="color:' + gapColor + '">' + gap + 'pp</td>';
+    244:       tbody.appendChild(tr);
+    245:     });
+    246:   }
+    247: 
+    248:   function renderAssociateScatter(assocs) {
+    249:     var above = assocs.filter(function (a) { return a.ptp >= 1.0; });
+    250:     var below = assocs.filter(function (a) { return a.ptp < 1.0; });
+    251: 
+    252:     Plotly.react('chart-assoc-scatter', [
+    253:       { x: above.map(function (a) { return a.units; }), y: above.map(function (a) { return a.ptp; }), text: above.map(function (a) { return a.login; }), mode: 'markers+text', textposition: 'top center', textfont: { size: 9, color: '#8b8fa3' }, marker: { size: above.map(function (a) { return (a.success_rate || 0.5) * 30; }), color: 'rgba(46,204,113,0.6)', line: { color: '#2ecc71', width: 1 } }, name: 'Above 1.0' },
+    254:       { x: below.map(function (a) { return a.units; }), y: below.map(function (a) { return a.ptp; }), text: below.map(function (a) { return a.login; }), mode: 'markers+text', textposition: 'top center', textfont: { size: 9, color: '#e74c3c' }, marker: { size: below.map(function (a) { return (a.success_rate || 0.5) * 30; }), color: 'rgba(231,76,60,0.6)', line: { color: '#e74c3c', width: 1 } }, name: 'Below 1.0' }
+    255:     ], L({
+    256:       xaxis: { title: 'Units', gridcolor: PG }, yaxis: { title: 'Yield PtP', gridcolor: PG },
+    257:       shapes: [breakLine(0, Math.max.apply(null, assocs.map(function (a) { return a.units; })) * 1.1, 1.0)],
+    258:       showlegend: true, legend: { x: 0.7, y: 0.15 }
+    259:     }), CFG);
+    260: 
+    261:     // Update top/bottom performer tables
+    262:     var sorted = assocs.slice().sort(function (a, b) { return b.ptp - a.ptp; });
+    263:     updatePerformerTable('#tab-associate .chart-row .chart-card:first-child tbody', sorted.slice(0, 8), true);
+    264:     updatePerformerTable('#tab-associate .chart-row .chart-card:last-child tbody', sorted.slice(-5).reverse(), false);
+    265:   }
+    266: 
+    267:   function updatePerformerTable(selector, rows, isTop) {
+    268:     var tbody = document.querySelector(selector);
+    269:     if (!tbody) return;
+    270:     tbody.innerHTML = '';
+    271:     rows.forEach(function (a) {
+    272:       var badge = a.ptp >= 1.15 ? '<span class="badge badge-green">Elite</span>' :
+    273:         a.ptp >= 1.0 ? '<span class="badge badge-green">Strong</span>' :
+    274:         a.ptp >= 0.9 ? '<span class="badge badge-yellow">Below Target</span>' :
+    275:         '<span class="badge badge-red">Critical</span>';
+    276:       var ptpColor = a.ptp >= 1.0 ? 'var(--green)' : a.ptp >= 0.9 ? 'var(--orange)' : 'var(--red)';
+    277:       var tr = document.createElement('tr');
+    278:       tr.innerHTML = '<td><strong>' + a.login + '</strong></td><td>' + (a.manager || '—') +
+    279:         '</td><td style="color:' + ptpColor + '">' + a.ptp.toFixed(4) +
+    280:         '</td><td>' + ((a.success_rate || 0) * 100).toFixed(2) +
+    281:         '%</td><td>' + a.units + '</td><td>' + badge + '</td>';
+    282:       tbody.appendChild(tr);
+    283:     });
+    284:   }
+    285: 
+    286:   function renderSiteTrendChart(rows) {
+    287:     var weeks = rows.map(function (r) { return r.week_label; });
+    288:     var ptp = rows.map(function (r) { return r.refurb_ptp; });
+    289:     var sr = rows.map(function (r) { return r.success_rate; });
+    290: 
+    291:     Plotly.react('chart-site-trend', [
+    292:       { x: weeks, y: ptp, name: 'Refurb PtP', type: 'scatter', mode: 'lines+markers', line: { color: '#4a90e2', width: 3 }, marker: { size: 8 } },
+    293:       { x: weeks, y: sr, name: 'Success Rate', type: 'scatter', mode: 'lines+markers', line: { color: '#2ecc71', width: 2 }, marker: { size: 6 } }
+    294:     ], L({
+    295:       yaxis: { range: [0.6, 1.2], gridcolor: PG },
+    296:       shapes: [breakLine(weeks[0], weeks[weeks.length - 1], 1.0)],
+    297:       showlegend: true, legend: { x: 0, y: 1.15, orientation: 'h' }
+    298:     }), CFG);
+    299:   }
+    300: 
+    301:   function renderDivergenceCharts(trend) {
+    302:     var weeks = trend.map(function (r) { return r.week_label; });
+    303:     var flatD = trend.map(function (r) { return r.flat_yield_dollar || 0; });
+    304:     var flatU = trend.map(function (r) { return r.flat_yield_unit || 0; });
+    305:     var ptp = trend.map(function (r) { return r.ptp; });
+    306:     var opp = trend.map(function (r) { return r.opp_cogs || 0; });
+    307: 
+    308:     // Divergence chart
+    309:     Plotly.react('chart-divergence', [
+    310:       { x: weeks, y: flatD, name: 'Flat Yield ($)', type: 'scatter', mode: 'lines+markers', line: { color: '#e74c3c', width: 3 }, marker: { size: 8 }, fill: 'tonexty', fillcolor: 'rgba(231,76,60,0.08)' },
+    311:       { x: weeks, y: flatU, name: 'Flat Yield (Units)', type: 'scatter', mode: 'lines+markers', line: { color: '#4a90e2', width: 3 }, marker: { size: 8 } },
+    312:       { x: weeks, y: ptp, name: 'AR PtP ($)', type: 'scatter', mode: 'lines+markers', line: { color: '#f39c12', width: 2, dash: 'dot' }, marker: { size: 6 }, yaxis: 'y2' }
+    313:     ], L({
+    314:       yaxis: { title: 'Flat Yield %', gridcolor: PG },
+    315:       yaxis2: { title: 'AR PtP ($)', overlaying: 'y', side: 'right', gridcolor: 'transparent' },
+    316:       showlegend: true, legend: { x: 0, y: 1.15, orientation: 'h' }
+    317:     }), CFG);
+    318: 
+    319:     // Flat yield comparison
+    320:     if (document.getElementById('chart-flat-yield')) {
+    321:       Plotly.react('chart-flat-yield', [
+    322:         { x: weeks, y: flatU, name: 'Flat Yield (Units %)', type: 'scatter', mode: 'lines+markers', line: { color: '#4a90e2', width: 3 }, marker: { size: 8 } },
+    323:         { x: weeks, y: flatD, name: 'Flat Yield ($ %)', type: 'scatter', mode: 'lines+markers', line: { color: '#e74c3c', width: 3 }, marker: { size: 8 } }
+    324:       ], L({ yaxis: { title: 'Yield %', gridcolor: PG }, showlegend: true, legend: { x: 0, y: 1.15, orientation: 'h' } }), CFG);
+    325:     }
+    326: 
+    327:     // Opp COGs bar
+    328:     if (document.getElementById('chart-opp-cogs')) {
+    329:       var colors = opp.map(function (c) { return c > 30000 ? '#2ecc71' : c > 15000 ? '#f39c12' : '#e74c3c'; });
+    330:       Plotly.react('chart-opp-cogs', [{
+    331:         x: weeks, y: opp, type: 'bar', marker: { color: colors },
+    332:         text: opp.map(function (c) { return '$' + c.toLocaleString(); }), textposition: 'outside', textfont: { color: '#e2e4e9', size: 11 }
+    333:       }], L({ yaxis: { title: 'AR Opp COGs ($)', gridcolor: PG } }), CFG);
+    334:     }
+    335:   }
+    336: 
+    337:   // ── BOO ────────────────────────────────────────────────────────────
+    338:   if (document.readyState === 'loading') {
+    339:     document.addEventListener('DOMContentLoaded', function () { setTimeout(loadData, 500); });
+    340:   } else {
+    341:     setTimeout(loadData, 500);
+    342:   }
+    343:   setInterval(loadData, REFRESH_MS);
+    344: })();
