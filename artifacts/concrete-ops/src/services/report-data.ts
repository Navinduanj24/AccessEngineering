import {
  getDeliveryDelayMinutes,
  getDeliveryDurations,
} from './delivery-service';
import type {
  Delivery,
  Project,
  ReportConfig,
  ReportFilters,
  Store,
  Truck,
} from '../data';

export type ReportRecord = {
  delivery: Delivery;
  projectName: string;
  customerName: string;
  mixerName: string;
  registration: string;
  delayMinutes: number | null;
  delayStage: string;
};

export type ReportKpis = {
  total: number;
  completed: number;
  onTimePercent: number;
  late: number;
  averageDelay: number;
  totalDelay: number;
  severe: number;
  quantity: number;
  averageSiteWait: number;
};

export type DailyMetric = { date: string; volume: number; averageDelay: number | null };
export type BreakdownMetric = { label: string; count: number; minutes: number };
export type ProjectMetric = {
  project: Project;
  deliveries: number;
  quantity: number;
  onTimePercent: number;
  averageDelay: number;
  averageSiteWait: number;
  severe: number;
};
export type FleetMetric = {
  truck: Truck;
  deliveries: number;
  onTimePercent: number;
  averageDelay: number;
  transitTime: number;
  mechanicalIncidents: number;
};
export type TimeMetric = { period: string; count: number; averageDelay: number };
export type ReportData = {
  config: ReportConfig;
  rows: ReportRecord[];
  kpis: ReportKpis;
  daily: DailyMetric[];
  reasons: BreakdownMetric[];
  stages: BreakdownMetric[];
  projects: ProjectMetric[];
  fleet: FleetMetric[];
  timeOfDay: TimeMetric[];
  exceptions: ReportRecord[];
  observations: string[];
  summary: string;
  filtersLabel: string;
};

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percent = (value: number, total: number) => total ? value / total * 100 : 0;
const completed = (record: Delivery) => Boolean(record.actualDelivery || record.unloadingComplete || record.status === 'Completed' || record.status === 'Delayed');
const normalize = (value: string) => value.trim().toLowerCase();

function stageFor(delivery: Delivery, store: Store) {
  if (delivery.delayStage) return delivery.delayStage;
  const stage = store.settings.reasons.find((reason) => reason.name === delivery.delayReason)?.stage;
  return stage === 'Site' ? 'Customer/Site' : stage || 'Unclassified';
}

function matchesFilters(delivery: Delivery, filters: ReportFilters, store: Store) {
  const stage = stageFor(delivery, store);
  const category = delivery.delayCategory;
  return (!filters.projectId || delivery.projectId === filters.projectId)
    && (!filters.customerId || delivery.customerId === filters.customerId)
    && (!filters.truckId || delivery.truckId === filters.truckId)
    && (!filters.concreteGrade || delivery.concreteGrade === filters.concreteGrade)
    && (!filters.deliveryStatus || delivery.status === filters.deliveryStatus)
    && (!filters.delayStage || stage === filters.delayStage)
    && (!filters.delayCategory || normalize(category) === normalize(filters.delayCategory))
    && (!filters.delayReason || normalize(delivery.delayReason) === normalize(filters.delayReason));
}

export function selectReportRecords(config: ReportConfig, store: Store): ReportRecord[] {
  const projectMap = new Map(store.projects.map((item) => [item.id, item.name]));
  const customerMap = new Map(store.customers.map((item) => [item.id, item.name]));
  const truckMap = new Map(store.trucks.map((item) => [item.id, item]));
  return store.deliveries
    .filter((delivery) => delivery.date >= config.startDate && delivery.date <= config.endDate)
    .filter((delivery) => matchesFilters(delivery, config.filters, store))
    .sort((a, b) => a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId))
    .map((delivery) => {
      const truck = truckMap.get(delivery.truckId);
      return {
        delivery,
        projectName: projectMap.get(delivery.projectId) || 'Unknown project',
        customerName: customerMap.get(delivery.customerId) || 'Unknown customer',
        mixerName: truck?.mixerNumber || delivery.truckId || '—',
        registration: truck?.registrationNumber || '—',
        delayMinutes: getDeliveryDelayMinutes(delivery),
        delayStage: stageFor(delivery, store),
      };
    });
}

function summarizeFilters(config: ReportConfig, store: Store) {
  const { filters } = config;
  const labels = [
    filters.projectId ? `Project: ${store.projects.find((item) => item.id === filters.projectId)?.name || filters.projectId}` : '',
    filters.customerId ? `Customer: ${store.customers.find((item) => item.id === filters.customerId)?.name || filters.customerId}` : '',
    filters.truckId ? `Mixer: ${store.trucks.find((item) => item.id === filters.truckId)?.mixerNumber || filters.truckId}` : '',
    filters.concreteGrade ? `Grade: ${filters.concreteGrade}` : '',
    filters.deliveryStatus ? `Status: ${filters.deliveryStatus}` : '',
    filters.delayStage ? `Stage: ${filters.delayStage}` : '',
    filters.delayCategory ? `Delay category: ${filters.delayCategory}` : '',
    filters.delayReason ? `Reason: ${filters.delayReason}` : '',
  ].filter(Boolean);
  return labels.length ? labels.join(' · ') : 'No additional filters';
}

export function buildReportData(config: ReportConfig, store: Store): ReportData {
  const rows = selectReportRecords(config, store);
  const deliveredRows = rows.filter((row) => completed(row.delivery));
  const timedRows = deliveredRows.filter((row) => row.delayMinutes !== null);
  const lateRows = timedRows.filter((row) => (row.delayMinutes ?? 0) > 0);
  const positiveDelays = lateRows.map((row) => row.delayMinutes as number);
  const kpis: ReportKpis = {
    total: rows.length,
    completed: deliveredRows.length,
    onTimePercent: percent(timedRows.filter((row) => (row.delayMinutes ?? 0) <= 0).length, timedRows.length),
    late: lateRows.length,
    averageDelay: mean(positiveDelays),
    totalDelay: positiveDelays.reduce((sum, delay) => sum + delay, 0),
    severe: positiveDelays.filter((delay) => delay >= store.settings.severeMin).length,
    quantity: deliveredRows.reduce((sum, row) => sum + Number(row.delivery.quantity || 0), 0),
    averageSiteWait: mean(deliveredRows.map((row) => getDeliveryDurations(row.delivery).siteWaiting).filter((value): value is number => value !== null)),
  };

  const days = new Map<string, ReportRecord[]>();
  rows.forEach((row) => days.set(row.delivery.date, [...(days.get(row.delivery.date) || []), row]));
  const daily = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, records]) => {
    const delays = records.map((row) => row.delayMinutes).filter((value): value is number => value !== null);
    return { date, volume: records.length, averageDelay: delays.length ? mean(delays) : null };
  });

  const groupBreakdown = (key: (row: ReportRecord) => string) => {
    const groups = new Map<string, ReportRecord[]>();
    lateRows.forEach((row) => {
      const label = key(row).trim() || 'Unclassified';
      groups.set(label, [...(groups.get(label) || []), row]);
    });
    return [...groups.entries()]
      .map(([label, records]) => ({ label, count: records.length, minutes: records.reduce((sum, row) => sum + (row.delayMinutes || 0), 0) }))
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes);
  };
  const reasons = groupBreakdown((row) => row.delivery.delayReason || 'Unclassified');
  const stages = groupBreakdown((row) => row.delayStage);

  const projects = store.projects.map((project) => {
    const records = rows.filter((row) => row.delivery.projectId === project.id);
    const completedProject = records.filter((row) => completed(row.delivery) && row.delayMinutes !== null);
    const delays = completedProject.map((row) => Math.max(0, row.delayMinutes || 0)).filter((value) => value > 0);
    return {
      project,
      deliveries: records.length,
      quantity: records.filter((row) => completed(row.delivery)).reduce((sum, row) => sum + row.delivery.quantity, 0),
      onTimePercent: percent(completedProject.filter((row) => (row.delayMinutes || 0) <= 0).length, completedProject.length),
      averageDelay: mean(delays),
      averageSiteWait: mean(completedProject.map((row) => getDeliveryDurations(row.delivery).siteWaiting).filter((value): value is number => value !== null)),
      severe: delays.filter((delay) => delay >= store.settings.severeMin).length,
    };
  }).filter((metric) => metric.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries);

  const fleet = store.trucks.map((truck) => {
    const records = rows.filter((row) => row.delivery.truckId === truck.id);
    const finished = records.filter((row) => completed(row.delivery) && row.delayMinutes !== null);
    const delays = finished.map((row) => Math.max(0, row.delayMinutes || 0)).filter((value) => value > 0);
    const mechanicalReasonNames = new Set(store.settings.reasons.filter((reason) => /mechanic/i.test(`${reason.name} ${reason.category}`)).map((reason) => reason.name));
    return {
      truck,
      deliveries: records.length,
      onTimePercent: percent(finished.filter((row) => (row.delayMinutes || 0) <= 0).length, finished.length),
      averageDelay: mean(delays),
      transitTime: mean(finished.map((row) => getDeliveryDurations(row.delivery).transit).filter((value): value is number => value !== null)),
      mechanicalIncidents: records.filter((row) => mechanicalReasonNames.has(row.delivery.delayReason)).length,
    };
  }).filter((metric) => metric.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries);

  const timeGroups = new Map<string, ReportRecord[]>();
  rows.forEach((row) => {
    const hour = Number(row.delivery.estimatedDeparture.slice(11, 13));
    if (!Number.isFinite(hour)) return;
    const start = Math.floor(hour / 2) * 2;
    const label = `${String(start).padStart(2, '0')}:00–${String(start + 2).padStart(2, '0')}:00`;
    timeGroups.set(label, [...(timeGroups.get(label) || []), row]);
  });
  const timeOfDay = [...timeGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, records]) => {
    const delays = records.map((row) => row.delayMinutes).filter((value): value is number => value !== null);
    return { period, count: records.length, averageDelay: mean(delays) };
  });

  const exceptions = lateRows.filter((row) => (row.delayMinutes || 0) >= store.settings.severeMin)
    .sort((a, b) => (b.delayMinutes || 0) - (a.delayMinutes || 0));

  const observations: string[] = [];
  const mainReason = reasons[0];
  if (mainReason) observations.push(`${mainReason.label} was the most frequently recorded late-delivery reason (${mainReason.count} of ${lateRows.length} late deliveries, ${percent(mainReason.count, lateRows.length).toFixed(1)}%).`);
  const mainStage = stages[0];
  if (mainStage) observations.push(`${mainStage.label} was the most frequently recorded delay stage (${mainStage.count} of ${lateRows.length} late deliveries, ${percent(mainStage.count, lateRows.length).toFixed(1)}%).`);
  const busyPeriod = [...timeOfDay].sort((a, b) => b.count - a.count)[0];
  if (busyPeriod) observations.push(`The highest recorded dispatch volume was ${busyPeriod.period} (${busyPeriod.count} deliveries).`);
  if (projects.length) {
    const longestWait = [...projects].sort((a, b) => b.averageSiteWait - a.averageSiteWait)[0];
    if (longestWait.averageSiteWait > 0) observations.push(`${longestWait.project.name} had the highest average recorded site wait among included projects (${Math.round(longestWait.averageSiteWait)} min).`);
  }
  if (observations.length === 0) observations.push('No late deliveries with a recorded delay reason or stage were found in the selected records.');

  const mainReasonLabel = reasons[0]?.label;
  const summary = rows.length
    ? `During the selected period, ${rows.length} deliveries were recorded. The recorded on-time delivery rate was ${kpis.onTimePercent.toFixed(1)}%, with an average positive delay of ${Math.round(kpis.averageDelay)} minutes.${mainReasonLabel ? ` ${mainReasonLabel} was the most frequently recorded delay reason.` : ''}`
    : 'No deliveries matched the selected reporting period and filters.';

  return {
    config,
    rows,
    kpis,
    daily,
    reasons,
    stages,
    projects,
    fleet,
    timeOfDay,
    exceptions,
    observations,
    summary,
    filtersLabel: summarizeFilters(config, store),
  };
}