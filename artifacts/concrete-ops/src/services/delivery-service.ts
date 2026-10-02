import { logAudit, type Delivery, type DeliveryStatus, type OpsSettings, type Store } from '../data';

export type DeliveryEventField =
  | 'loadingStart'
  | 'loadingComplete'
  | 'actualDeparture'
  | 'siteArrival'
  | 'unloadingStart'
  | 'unloadingComplete'
  | 'actualDelivery';

export type DeliveryDurations = {
  loading: number | null;
  transit: number | null;
  siteWaiting: number | null;
  unloading: number | null;
  totalCycle: number | null;
};

const timestamp = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export function getDeliveryDelayMinutes(delivery: Pick<Delivery, 'estimatedDelivery' | 'actualDelivery'>) {
  const estimated = timestamp(delivery.estimatedDelivery);
  const actual = timestamp(delivery.actualDelivery);
  return estimated === null || actual === null ? null : Math.round((actual - estimated) / 60000);
}

export function formatDeliveryDelay(minutes: number | null) {
  if (minutes === null) return 'Pending';
  if (minutes === 0) return 'On time';
  if (minutes < 0) return `${Math.abs(minutes)} min early`;
  return `${minutes} min late`;
}

export function classifyDeliveryDelay(minutes: number | null, settings: Pick<OpsSettings, 'slightMax' | 'delayedMax' | 'severeMin'>) {
  if (minutes === null) return 'PENDING';
  if (minutes <= 0) return 'ON TIME';
  if (minutes <= settings.slightMax) return 'SLIGHT DELAY';
  if (minutes < settings.severeMin && minutes <= settings.delayedMax) return 'DELAYED';
  return 'SEVERE DELAY';
}

export function getDeliveryDurations(delivery: Delivery): DeliveryDurations {
  const between = (from: string, to: string) => {
    const start = timestamp(from);
    const end = timestamp(to);
    return start === null || end === null ? null : Math.max(0, Math.round((end - start) / 60000));
  };
  return {
    loading: between(delivery.loadingStart, delivery.loadingComplete),
    transit: between(delivery.actualDeparture, delivery.siteArrival),
    siteWaiting: between(delivery.siteArrival, delivery.unloadingStart),
    unloading: between(delivery.unloadingStart, delivery.unloadingComplete),
    totalCycle: between(delivery.loadingStart, delivery.actualDelivery || delivery.unloadingComplete),
  };
}

export function deriveDeliveryStatus(delivery: Delivery): DeliveryStatus {
  if (delivery.statusOverride) return delivery.status;
  if (delivery.status === 'Cancelled') return 'Cancelled';
  const delay = getDeliveryDelayMinutes(delivery);
  if (delivery.actualDelivery || delivery.unloadingComplete) return delay !== null && delay > 0 ? 'Delayed' : 'Completed';
  if (delivery.unloadingStart) return 'Unloading';
  if (delivery.siteArrival) return 'Waiting';
  if (delivery.actualDeparture) return 'In Transit';
  if (delivery.loadingComplete) return 'Ready';
  if (delivery.loadingStart) return 'Loading';
  return 'Scheduled';
}

export function isDeliveryCompleted(delivery: Delivery) {
  return Boolean(delivery.actualDelivery || delivery.unloadingComplete) || delivery.status === 'Completed';
}

export function suggestDelayStage(delivery: Delivery, settings: Pick<OpsSettings, 'expectedLoadingMinutes' | 'expectedTransitMinutes' | 'expectedSiteWaitMinutes'>) {
  const durations = getDeliveryDurations(delivery);
  if (durations.loading !== null && durations.loading > settings.expectedLoadingMinutes) {
    return { stage: 'Plant', detail: `Loading took ${durations.loading} min; the configured expectation is ${settings.expectedLoadingMinutes} min.` };
  }
  if (durations.transit !== null && durations.transit > settings.expectedTransitMinutes) {
    return { stage: 'Transit', detail: `Transit took ${durations.transit} min; the configured expectation is ${settings.expectedTransitMinutes} min.` };
  }
  if (durations.siteWaiting !== null && durations.siteWaiting > settings.expectedSiteWaitMinutes) {
    return { stage: 'Customer/Site', detail: `Site waiting took ${durations.siteWaiting} min; the configured expectation is ${settings.expectedSiteWaitMinutes} min.` };
  }
  return null;
}

export function validateDelivery(delivery: Delivery, store: Store, ignoreId = delivery.id) {
  const errors: string[] = [];
  if (!delivery.orderId.trim()) errors.push('Enter an Order ID.');
  if (delivery.orderId.trim() && store.deliveries.some((item) => item.id !== ignoreId && item.orderId.trim().toLowerCase() === delivery.orderId.trim().toLowerCase())) {
    errors.push('That Order ID is already in use.');
  }
  if (!delivery.date || Number.isNaN(Date.parse(`${delivery.date}T00:00:00`))) errors.push('Choose a valid delivery date.');
  if (!delivery.projectId || !store.projects.some((item) => item.id === delivery.projectId)) errors.push('Choose a registered project.');
  if (!delivery.customerId || !store.customers.some((item) => item.id === delivery.customerId)) errors.push('Choose a registered customer.');
  if (!delivery.concreteGrade || !store.settings.concreteGrades.includes(delivery.concreteGrade)) errors.push('Choose a configured concrete grade.');
  if (!Number.isFinite(Number(delivery.quantity)) || Number(delivery.quantity) <= 0) errors.push('Quantity must be greater than 0 m³.');
  if (!delivery.truckId || !store.trucks.some((item) => item.id === delivery.truckId)) errors.push('Choose a registered mixer.');
  if (!delivery.estimatedDelivery || timestamp(delivery.estimatedDelivery) === null) errors.push('Enter a valid estimated delivery time.');

  const timedFields: [keyof Delivery, string][] = [
    ['estimatedDeparture', 'Estimated departure'],
    ['estimatedDelivery', 'Estimated delivery'],
    ['loadingStart', 'Loading started'],
    ['loadingComplete', 'Loading completed'],
    ['actualDeparture', 'Actual departure'],
    ['siteArrival', 'Site arrival'],
    ['unloadingStart', 'Unloading started'],
    ['unloadingComplete', 'Unloading completed'],
    ['actualDelivery', 'Actual delivery'],
  ];
  timedFields.forEach(([field, label]) => {
    const value = delivery[field];
    if (typeof value === 'string' && value && timestamp(value) === null) errors.push(`${label} is not a valid time.`);
  });

  const actualSequence: [keyof Delivery, string][] = [
    ['loadingStart', 'Loading started'],
    ['loadingComplete', 'Loading completed'],
    ['actualDeparture', 'Actual departure'],
    ['siteArrival', 'Site arrival'],
    ['unloadingStart', 'Unloading started'],
    ['unloadingComplete', 'Unloading completed'],
    ['actualDelivery', 'Actual delivery'],
  ];
  let previous: { field: keyof Delivery; label: string; time: number } | null = null;
  actualSequence.forEach(([field, label]) => {
    const value = delivery[field];
    if (typeof value !== 'string' || !value) return;
    const time = timestamp(value);
    if (time === null) return;
    if (previous && time < previous.time) errors.push(`${label} cannot be earlier than ${previous.label.toLowerCase()}.`);
    previous = { field, label, time };
  });
  return { valid: errors.length === 0, errors };
}

export function getDelivery(store: Store, id: string) {
  return store.deliveries.find((delivery) => delivery.id === id);
}

export function getDeliveries(store: Store) {
  return store.deliveries;
}

export function saveDeliveryDraft(store: Store, draft: Delivery, draftId?: string) {
  const id = draftId || draft.id || `DRAFT-${Date.now()}`;
  const saved = { ...draft, id, updatedAt: new Date().toISOString(), createdBy: store.role };
  const previous = store.drafts.find((item) => item.id === id);
  let next = logAudit(store, previous ? 'Updated delivery draft' : 'Saved delivery draft', 'Delivery Draft', id, previous?.orderId || '', saved.orderId || '');
  next = { ...next, drafts: previous ? next.drafts.map((item) => item.id === id ? saved : item) : [saved, ...next.drafts] };
  return next;
}

export function deleteDeliveryDraft(store: Store, id: string) {
  const draft = store.drafts.find((item) => item.id === id);
  if (!draft) return store;
  const next = logAudit(store, 'Deleted delivery draft', 'Delivery Draft', id, draft.orderId, '');
  return { ...next, drafts: next.drafts.filter((item) => item.id !== id) };
}

export function createDelivery(store: Store, delivery: Delivery, draftId?: string) {
  const id = `DEL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const created: Delivery = {
    ...delivery,
    id,
    status: deriveDeliveryStatus(delivery),
    createdAt: now,
    updatedAt: now,
    createdBy: store.role,
  };
  let next = logAudit(store, 'Created delivery', 'Delivery', id, '', created.orderId);
  next = {
    ...next,
    deliveries: [created, ...next.deliveries],
    drafts: draftId ? next.drafts.filter((item) => item.id !== draftId) : next.drafts,
  };
  return { store: next, delivery: created };
}

export function updateDelivery(store: Store, delivery: Delivery) {
  const existing = store.deliveries.find((item) => item.id === delivery.id);
  if (!existing) return store;
  const updated: Delivery = { ...delivery, status: deriveDeliveryStatus(delivery), updatedAt: new Date().toISOString() };
  const changedFields = (Object.keys(updated) as (keyof Delivery)[]).filter((field) =>
    field !== 'updatedAt' && String(existing[field] ?? '') !== String(updated[field] ?? ''),
  );
  let next = store;
  for (const field of changedFields) {
    next = logAudit(next, `Updated delivery · ${field}`, 'Delivery', updated.id, String(existing[field] ?? ''), String(updated[field] ?? ''));
  }
  return { ...next, deliveries: next.deliveries.map((item) => item.id === updated.id ? updated : item) };
}

export function recordDeliveryEvent(store: Store, id: string, field: DeliveryEventField, value = new Date().toISOString()) {
  const existing = store.deliveries.find((item) => item.id === id);
  if (!existing) return store;
  const updated = { ...existing, [field]: value, statusOverride: false, updatedAt: new Date().toISOString() };
  updated.status = deriveDeliveryStatus(updated);
  const next = logAudit(store, `Recorded delivery event · ${field}`, 'Delivery', id, existing[field], value);
  return { ...next, deliveries: next.deliveries.map((item) => item.id === id ? updated : item) };
}

export function deleteDelivery(store: Store, id: string) {
  const existing = store.deliveries.find((item) => item.id === id);
  if (!existing) return store;
  const next = logAudit(store, 'Deleted delivery', 'Delivery', id, existing.orderId, '');
  return { ...next, deliveries: next.deliveries.filter((item) => item.id !== id) };
}