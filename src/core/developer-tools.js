const SAFE_EVENT_FIELDS = new Set([
  'kind', 'count', 'id', 'enabled', 'action', 'completed', 'state', 'animation',
  'source', 'module', 'sensor', 'reason', 'durationMs', 'mode', 'fps',
]);

export function filterInspectorEvents(events, { query = '', eventName = '' } = {}) {
  const search = String(query).trim().toLocaleLowerCase('en-US');
  const selectedName = String(eventName).trim();
  return events.filter((entry) => {
    if (selectedName && entry.name !== selectedName) return false;
    if (!search) return true;
    return `${entry.name} ${JSON.stringify(entry.payload ?? {})}`
      .toLocaleLowerCase('en-US')
      .includes(search);
  });
}

export function summarizeInspectorPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => SAFE_EVENT_FIELDS.has(key))
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [
        key,
        typeof value === 'string' ? value.slice(0, 120) : value,
      ]),
  );
}
