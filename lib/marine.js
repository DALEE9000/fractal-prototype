function number(value) {
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBuoy(text, now = Date.now()) {
  const [header, , ...lines] = text.trim().split(/\r?\n/);
  if (!header?.startsWith('#YY')) return {};
  const fields = header.slice(1).trim().split(/\s+/);
  const latest = {};
  for (const line of lines) {
    const cells = line.trim().split(/\s+/);
    const [year, month, day, hour, minute] = cells.slice(0, 5).map(Number);
    const time = Date.UTC(year, month - 1, day, hour, minute);
    if (!Number.isFinite(time) || time > now + 600000) continue;
    if (now - time > 24 * 3600000) break;
    for (const [key, field, scale] of [['wave', 'WVHT', 3.28084], ['period', 'DPD', 1], ['wind', 'WSPD', 1.94384]]) {
      const value = number(cells[fields.indexOf(field)]);
      if (latest[key] || value === null || value < 0) continue;
      latest[key] = { value: value * scale, time: new Date(time).toISOString() };
    }
    if (latest.wave && latest.period && latest.wind) break;
  }
  return latest;
}

export function parseHarbor(json) {
  const row = json?.data?.at(-1);
  const value = number(row?.v);
  if (value === null || !row.t) return null;
  const time = Date.parse(row.t.replace(' ', 'T') + 'Z');
  return Number.isFinite(time) ? { value, time: new Date(time).toISOString() } : null;
}

async function read(url, type) {
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), next: { revalidate: 300 } });
  if (!res.ok) throw new Error('Station feed unavailable');
  return res[type]();
}

export async function getConditions(port) {
  const query = new URLSearchParams({ station: port.tide, product: 'water_level', range: '24', datum: 'MLLW', time_zone: 'gmt', units: 'english', format: 'json', application: 'HarborLedger' });
  const [tide, buoy] = await Promise.allSettled([
    read('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?' + query, 'json').then(parseHarbor),
    read('https://www.ndbc.noaa.gov/data/realtime2/' + port.buoy + '.txt', 'text').then(text => parseBuoy(text))
  ]);
  return { water: tide.value ?? null, ...buoy.value };
}
