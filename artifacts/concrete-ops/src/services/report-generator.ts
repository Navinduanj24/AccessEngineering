import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportConfig, ReportHistory, ReportSection, Store } from '../data';
import { buildReportData, type ReportData, type ReportRecord } from './report-data';

const NAVY: [number, number, number] = [18, 54, 78];
const BLUE: [number, number, number] = [25, 119, 154];
const CYAN: [number, number, number] = [70, 169, 188];
const INK: [number, number, number] = [38, 57, 72];
const MUTED: [number, number, number] = [100, 119, 134];
const PALE: [number, number, number] = [238, 245, 248];
const LINE: [number, number, number] = [210, 222, 229];
const RED: [number, number, number] = [173, 73, 61];
const MARGIN = 14;
const PAGE_BOTTOM = 273;
type Point = { label: string; value: number };

const dateLabel = (value: string) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const timeLabel = (value: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const minutesLabel = (value: number | null) => {
  if (value === null) return '—';
  if (value === 0) return 'On time';
  return value > 0 ? `${value} min late` : `${Math.abs(value)} min early`;
};

const reportTitle: Record<ReportConfig['type'], string> = {
  'Daily Operations Report': 'Daily Operations Report',
  'Weekly Performance Report': 'Weekly Performance Report',
  'Monthly Management Report': 'Monthly Management Report',
  'Custom Report': 'Custom Operations Report',
};

export function buildExecutiveSummary(data: ReportData) {
  return data.summary;
}

export function buildKpiSection(data: ReportData) {
  return [
    ['Total deliveries', String(data.kpis.total)],
    ['Completed deliveries', String(data.kpis.completed)],
    ['On-time delivery', `${data.kpis.onTimePercent.toFixed(1)}%`],
    ['Late deliveries', String(data.kpis.late)],
    ['Average delay', `${Math.round(data.kpis.averageDelay)} min`],
    ['Severe delays', String(data.kpis.severe)],
    ['Quantity delivered', `${data.kpis.quantity.toFixed(1)} m³`],
    ['Average site waiting', `${Math.round(data.kpis.averageSiteWait)} min`],
  ];
}

function addTable(doc: jsPDF, title: string, head: string[], rows: string[][], y: number, widths?: number[]) {
  if (y > PAGE_BOTTOM - 26) {
    doc.addPage();
    y = 21;
  }
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(title, MARGIN, y);
    y += 4;
  }
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 17, bottom: 20 },
    head: [head],
    body: rows.length ? rows : [['No matching records', ...Array(Math.max(0, head.length - 1)).fill('')]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2.1, textColor: INK, lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7, cellPadding: 2.3 },
    alternateRowStyles: { fillColor: [247, 250, 251] },
    columnStyles: widths ? Object.fromEntries(widths.map((cellWidth, index) => [index, { cellWidth }])) : undefined,
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
  });
  const last = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (last?.finalY ?? y) + 8;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number) {
  if (y > PAGE_BOTTOM - 34) {
    doc.addPage();
    y = 22;
  }
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y - 4, MARGIN + 12, y - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN, y + 2);
  return y + 10;
}

function drawKpis(doc: jsPDF, data: ReportData, y: number) {
  const values = buildKpiSection(data);
  const gap = 3;
  const boxWidth = (210 - MARGIN * 2 - gap * 3) / 4;
  values.forEach(([label, value], index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const x = MARGIN + column * (boxWidth + gap);
    const top = y + row * 20;
    doc.setFillColor(...PALE);
    doc.roundedRect(x, top, boxWidth, 16, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(value, x + 3, top + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 3, top + 12);
  });
}

function drawHorizontalBars(doc: jsPDF, title: string, points: Point[], y: number, maxItems = 8) {
  const entries = points.slice(0, maxItems);
  const height = Math.max(23, 9 + entries.length * 7);
  if (y + height > PAGE_BOTTOM) {
    doc.addPage();
    y = 23;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN, y);
  const startY = y + 5;
  const labelWidth = 49;
  const barX = MARGIN + labelWidth;
  const chartWidth = 118;
  const max = Math.max(1, ...entries.map((point) => point.value));
  entries.forEach((point, index) => {
    const rowY = startY + index * 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(...INK);
    doc.text(point.label.length > 25 ? `${point.label.slice(0, 23)}…` : point.label, MARGIN, rowY + 3.8);
    doc.setFillColor(...PALE);
    doc.rect(barX, rowY, chartWidth, 4.6, 'F');
    doc.setFillColor(...BLUE);
    doc.rect(barX, rowY, Math.max(0.8, chartWidth * point.value / max), 4.6, 'F');
    doc.setTextColor(...MUTED);
    doc.text(String(point.value), barX + chartWidth + 3, rowY + 3.8);
  });
  return startY + entries.length * 7 + 6;
}

function drawLinePlot(doc: jsPDF, title: string, points: Point[], y: number, color: [number, number, number] = BLUE) {
  if (y + 56 > PAGE_BOTTOM) {
    doc.addPage();
    y = 23;
  }
  const x = MARGIN + 13;
  const top = y + 10;
  const width = 162;
  const height = 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(x, top + height, x + width, top + height);
  if (!points.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('No values available for this period.', x, top + 9);
    return top + height + 9;
  }
  const max = Math.max(1, ...points.map((point) => point.value));
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.9);
  points.forEach((point, index) => {
    const pointX = x + step * index;
    const pointY = top + height - (point.value / max) * height;
    if (index) {
      const previous = points[index - 1];
      const previousX = x + step * (index - 1);
      const previousY = top + height - (previous.value / max) * height;
      doc.line(previousX, previousY, pointX, pointY);
    }
    doc.setFillColor(...color);
    doc.circle(pointX, pointY, 1, 'F');
    if (points.length <= 12 || index % Math.ceil(points.length / 10) === 0 || index === points.length - 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.4);
      doc.setTextColor(...MUTED);
      doc.text(point.label, pointX, top + height + 5, { align: 'center' });
    }
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  doc.text(`Peak ${max}`, x + width, top + 3, { align: 'right' });
  return top + height + 12;
}

function drawVolumeBars(doc: jsPDF, title: string, points: Point[], y: number) {
  if (y + 57 > PAGE_BOTTOM) {
    doc.addPage();
    y = 23;
  }
  const x = MARGIN + 13;
  const top = y + 10;
  const width = 162;
  const height = 37;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(title, MARGIN, y);
  doc.setDrawColor(...LINE);
  doc.line(x, top + height, x + width, top + height);
  if (!points.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('No values available for this period.', x, top + 9);
    return top + height + 9;
  }
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = width / points.length;
  points.forEach((point, index) => {
    const barWidth = Math.max(1, slot * 0.62);
    const barHeight = Math.max(0.6, point.value / max * height);
    const barX = x + slot * index + (slot - barWidth) / 2;
    doc.setFillColor(...CYAN);
    doc.rect(barX, top + height - barHeight, barWidth, barHeight, 'F');
    if (points.length <= 12 || index % Math.ceil(points.length / 10) === 0 || index === points.length - 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(...MUTED);
      doc.text(point.label, barX + barWidth / 2, top + height + 5, { align: 'center' });
    }
  });
  return top + height + 12;
}

function drawHeatmap(doc: jsPDF, data: ReportData, y: number) {
  if (y + 34 > PAGE_BOTTOM) {
    doc.addPage();
    y = 23;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text('Recorded dispatch patterns · average delivery delay by departure window', MARGIN, y);
  const top = y + 6;
  const max = Math.max(1, ...data.timeOfDay.map((item) => item.averageDelay));
  const cellWidth = (210 - MARGIN * 2 - 2 * Math.max(0, data.timeOfDay.length - 1)) / Math.max(1, data.timeOfDay.length);
  data.timeOfDay.forEach((item, index) => {
    const intensity = item.averageDelay / max;
    const fill: [number, number, number] = intensity > 0.65 ? [190, 225, 230] : intensity > 0.3 ? [218, 237, 239] : [238, 245, 248];
    const x = MARGIN + index * (cellWidth + 2);
    doc.setFillColor(...fill);
    doc.rect(x, top, cellWidth, 13, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...NAVY);
    doc.text(`${Math.round(item.averageDelay)}m`, x + cellWidth / 2, top + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.6);
    doc.setTextColor(...MUTED);
    doc.text(item.period.split('–')[0], x + cellWidth / 2, top + 10, { align: 'center' });
  });
  return top + 20;
}

function deliveryTableRows(data: ReportData) {
  return data.rows.map(({ delivery, projectName, mixerName, delayMinutes }) => [
    delivery.orderId,
    projectName,
    mixerName,
    delivery.concreteGrade,
    `${Number(delivery.quantity).toFixed(1)} m³`,
    timeLabel(delivery.estimatedDelivery),
    timeLabel(delivery.actualDelivery),
    minutesLabel(delayMinutes),
    delivery.status,
    delivery.delayReason || '—',
  ]);
}

function appendixRows(data: ReportData) {
  return data.rows.map(({ delivery, projectName, customerName, mixerName, delayStage, delayMinutes }) => [
    dateLabel(delivery.date),
    delivery.orderId,
    projectName,
    customerName,
    mixerName,
    delivery.concreteGrade,
    `${Number(delivery.quantity).toFixed(1)} m³`,
    timeLabel(delivery.estimatedDeparture),
    timeLabel(delivery.actualDeparture),
    timeLabel(delivery.estimatedDelivery),
    timeLabel(delivery.actualDelivery),
    minutesLabel(delayMinutes),
    delayStage,
    delivery.delayReason || '—',
    delivery.status,
  ]);
}

function detailedDeliverySection(doc: jsPDF, data: ReportData, y: number) {
  y = drawSectionTitle(doc, 'Delivery Performance', y);
  y = drawTable(doc, 'Daily Operations delivery register', [
    'Order ID', 'Project', 'Truck', 'Grade', 'Quantity', 'Estimated', 'Actual', 'Delay', 'Status', 'Reason',
  ], deliveryTableRows(data), y, [18, 28, 16, 14, 16, 16, 16, 18, 18, 24]);
  return y;
}

function drawTable(doc: jsPDF, title: string, head: string[], rows: string[][], y: number, widths?: number[]) {
  return addTable(doc, title, head, rows, y, widths);
}

function coverPage(doc: jsPDF, config: ReportConfig, data: ReportData, store: Store, generatedAt: Date) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 81, 'F');
  doc.setFillColor(...CYAN);
  doc.rect(0, 81, 210, 2.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(190, 226, 233);
  doc.text('CONCRETE DELIVERY', MARGIN, 25);
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('OPERATIONS', MARGIN, 37);
  doc.setDrawColor(112, 190, 205);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, 45, MARGIN + 28, 45);
  doc.setFontSize(17);
  doc.text('PERFORMANCE REPORT', MARGIN, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(store.settings.plantName, MARGIN, 105);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(store.settings.location, MARGIN, 112);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(reportTitle[config.type], MARGIN, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`${dateLabel(config.startDate)}  —  ${dateLabel(config.endDate)}`, MARGIN, 149);
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, 159, 210 - MARGIN, 159);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('APPLIED FILTERS', MARGIN, 170);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const filterLines = doc.splitTextToSize(data.filtersLabel, 172);
  doc.text(filterLines, MARGIN, 177);
  doc.setFillColor(...PALE);
  doc.roundedRect(MARGIN, 207, 182, 33, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);
  doc.text(`${data.kpis.total} matching delivery records`, MARGIN + 5, 217);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${generatedAt.toLocaleString('en-GB')}`, MARGIN + 5, 225);
  doc.text('Confidential / Internal Use', MARGIN + 5, 233);
}

function addDocumentFooter(doc: jsPDF, plantName: string) {
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, height - 15, width - MARGIN, height - 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('Concrete Delivery Operations Intelligence System', MARGIN, height - 10);
    doc.text(`${plantName} · Confidential / Internal Use`, width / 2, height - 10, { align: 'center' });
    doc.text(`Page ${page} of ${total}`, width - MARGIN, height - 10, { align: 'right' });
  }
}

function addSection(doc: jsPDF, title: string, y: number) {
  return drawSectionTitle(doc, title, y);
}

function reportTableRecord(row: ReportRecord) {
  return row.delivery;
}

function buildReportDocument(config: ReportConfig, store: Store) {
  const data = buildReportData(config, store);
  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  coverPage(doc, config, data, store, generatedAt);
  doc.addPage();
  let y = 22;
  const sections = new Set<ReportSection>(config.sections);

  if (sections.has('executiveSummary')) {
    y = addSection(doc, 'Executive Summary', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const summaryLines = doc.splitTextToSize(buildExecutiveSummary(data), 180);
    doc.text(summaryLines, MARGIN, y);
    y += summaryLines.length * 4.8 + 8;
  }

  if (sections.has('kpiSummary')) {
    y = addSection(doc, 'KPI Summary', y);
    drawKpis(doc, data, y);
    y += 45;
  }

  if (sections.has('deliveryPerformance')) {
    y = detailedDeliverySection(doc, data, y);
  }

  if (sections.has('dailyTrend')) {
    y = addSection(doc, 'Delivery Trend', y);
    y = drawVolumeBars(doc, 'Daily delivery volume', data.daily.map((item) => ({ label: item.date.slice(5), value: item.volume })), y);
    y = drawLinePlot(doc, 'Daily average delivery delay (minutes; includes early deliveries as negative)', data.daily
      .filter((item) => item.averageDelay !== null)
      .map((item) => ({ label: item.date.slice(5), value: item.averageDelay as number })), y, CYAN);
  }

  if (sections.has('delayAnalysis')) {
    y = addSection(doc, 'Delay Analysis', y);
    y = drawHorizontalBars(doc, 'Recorded delay reasons · late deliveries', data.reasons.map((item) => ({ label: item.label, value: item.count })), y);
    y = addTable(doc, 'Delay totals', ['Measure', 'Value'], [
      ['Late deliveries with recorded actual time', String(data.kpis.late)],
      ['Total positive delay minutes', String(data.kpis.totalDelay)],
      ['Average positive delay', `${Math.round(data.kpis.averageDelay)} min`],
    ], y, [112, 50]);
  }

  if (sections.has('delayStageAnalysis')) {
    y = addSection(doc, 'Delay Stage Analysis', y);
    y = drawHorizontalBars(doc, 'Recorded stage among late deliveries', data.stages.map((item) => ({ label: item.label, value: item.count })), y);
    y = addTable(doc, 'Stage summary', ['Delay stage', 'Late deliveries', 'Delay minutes'], data.stages.map((item) => [item.label, String(item.count), String(item.minutes)]), y);
  }

  if (sections.has('projectPerformance')) {
    y = addSection(doc, 'Project Performance', y);
    y = drawHorizontalBars(doc, 'Deliveries by project', data.projects.map((item) => ({ label: item.project.name, value: item.deliveries })), y);
    y = addTable(doc, 'Project comparison', ['Project', 'Deliveries', 'Quantity', 'On-time', 'Avg delay', 'Site wait', 'Severe'], data.projects.map((item) => [
      item.project.name, String(item.deliveries), `${item.quantity.toFixed(1)} m³`, `${item.onTimePercent.toFixed(1)}%`, `${Math.round(item.averageDelay)} min`, `${Math.round(item.averageSiteWait)} min`, String(item.severe),
    ]), y, [43, 19, 20, 18, 20, 20, 18]);
  }

  if (sections.has('fleetPerformance')) {
    y = addSection(doc, 'Fleet Performance', y);
    y = drawTable(doc, 'Mixer comparison', ['Mixer', 'Deliveries', 'On-time', 'Avg delay', 'Transit', 'Mechanical incidents'], data.fleet.map((item) => [
      item.truck.mixerNumber, String(item.deliveries), `${item.onTimePercent.toFixed(1)}%`, `${Math.round(item.averageDelay)} min`, `${Math.round(item.transitTime)} min`, String(item.mechanicalIncidents),
    ]), y, [32, 25, 25, 28, 28, 40]);
  }

  if (sections.has('timeOfDayAnalysis')) {
    y = addSection(doc, 'Time-of-Day Analysis', y);
    y = drawHeatmap(doc, data, y);
    y = addTable(doc, 'Observed departure windows', ['Time window', 'Deliveries', 'Average delay'], data.timeOfDay.map((item) => [
      item.period, String(item.count), `${Math.round(item.averageDelay)} min`,
    ]), y, [70, 35, 45]);
  }

  if (sections.has('exceptions')) {
    y = addSection(doc, 'Operational Exceptions', y);
    y = addTable(doc, 'Severe late deliveries', ['Order ID', 'Project', 'Delay', 'Stage', 'Reason', 'Status'], data.exceptions.slice(0, 50).map((item) => {
      const delivery = reportTableRecord(item);
      return [delivery.orderId, item.projectName, minutesLabel(item.delayMinutes), item.delayStage, delivery.delayReason || '—', delivery.status];
    }), y, [27, 44, 25, 27, 40, 22]);
  }

  if (sections.has('operationalObservations')) {
    y = addSection(doc, 'Operational Observations', y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...BLUE);
    doc.text('OBSERVED DATA', MARGIN, y);
    y += 5;
    data.observations.forEach((observation) => {
      const lines = doc.splitTextToSize(`• ${observation}`, 177);
      if (y + lines.length * 4.2 > PAGE_BOTTOM) {
        doc.addPage();
        y = 22;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(lines, MARGIN, y);
      y += lines.length * 4.5 + 2;
    });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('These are descriptive patterns in the selected records; they do not establish cause.', MARGIN, y + 2);
  }

  if (sections.has('deliveryAppendix')) {
    doc.addPage();
    y = addSection(doc, 'Detailed Delivery Appendix', 22);
    y = addTable(doc, `All ${data.rows.length} deliveries matching selected filters`, [
      'Date', 'Order', 'Project', 'Customer', 'Truck', 'Grade', 'Qty', 'Est. dep.', 'Act. dep.', 'ETA', 'Actual', 'Delay', 'Stage', 'Reason', 'Status',
    ], appendixRows(data), y, [16, 18, 24, 23, 14, 13, 12, 14, 14, 14, 14, 17, 19, 21, 15]);
  }

  addDocumentFooter(doc, store.settings.plantName);
  const safeType = config.type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `concrete-operations-${safeType}-${config.startDate}-to-${config.endDate}.pdf`;
  return { doc, data, generatedAt, filename };
}

export function generateReportPdf(config: ReportConfig, store: Store) {
  const result = buildReportDocument(config, store);
  result.doc.save(result.filename);
  const history: ReportHistory = {
    id: `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${reportTitle[config.type]} · ${dateLabel(config.startDate)} – ${dateLabel(config.endDate)}`,
    type: config.type,
    startDate: config.startDate,
    endDate: config.endDate,
    generatedBy: store.role,
    generatedAt: result.generatedAt.toISOString(),
    filters: config.filters,
    recordCount: result.data.rows.length,
    sections: [...config.sections],
  };
  return { history, filename: result.filename, reportData: result.data };
}

export const generateDailyReport = (config: ReportConfig, store: Store) => generateReportPdf({ ...config, type: 'Daily Operations Report' }, store);
export const generateWeeklyReport = (config: ReportConfig, store: Store) => generateReportPdf({ ...config, type: 'Weekly Performance Report' }, store);
export const generateMonthlyReport = (config: ReportConfig, store: Store) => generateReportPdf({ ...config, type: 'Monthly Management Report' }, store);
export const generateCustomReport = (config: ReportConfig, store: Store) => generateReportPdf({ ...config, type: 'Custom Report' }, store);