import { classify, scoreLead } from './core.js';

export const API_URLS = Object.freeze({
  koop: 'https://repository.overheid.nl/sru',
  location: 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free',
  bag: 'https://api.pdok.nl/kadaster/bag/ogc/v2',
  kvkTest: 'https://api.kvk.nl/test/api'
});
// Dit is de openbare sleutel die KVK zelf voor fictieve testdata publiceert.
// Een eigen productie- of testsleutel hoort nooit in deze browserdemo.
export const PUBLIC_KVK_TEST_KEY = 'l7xx1f2691f2520d487b902f4e0b57a0b197';
export const REFERENCE_IDS = ['gmb-2021-160445', 'gmb-2025-383923', 'gmb-2025-383004'];
const norm = v => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const addressOnly = title => String(title).split(/\b(?:zaaknummer|zaaknr|kenmerk|dossiernummer|dossiernr)\b/i)[0].trim();
export function extractAddresses(publication) {
  const queries = [];
  for (const value of publication.postal || []) {
    const match = value.match(/^\s*(\d{4}\s?[A-Z]{2})\s+(\d{1,5})(?:\s*([A-Za-z]))?(?:\s+([\w-]+))?\s*$/);
    if (match) queries.push(match.slice(1).filter(Boolean).join(' '));
  }
  if (queries.length) return [...new Set(queries)];
  let text = addressOnly(publication.title);
  const addressPart = text.match(/\b(?:op de locatie|locatie|ter plaatse van|op het adres|adres)\s+(.+?)(?:\s+te\s+|,|$)/i);
  if (addressPart) text = addressPart[1];
  if (/\d\s*(?:t\/m|tot en met|en|\/)\s*\d|\d\s*[-–]\s*\d/.test(text)) return [];
  for (const match of text.matchAll(/([A-ZÀ-Ÿ][\w'’.-]*(?:\s+(?:van|de|den|der|het|[A-ZÀ-Ÿ][\w'’.-]*)){0,5})\s+(\d{1,5}[A-Za-z]?)(?!\d)/g)) {
    if (!/\b(?:datum|ontvangen|kenmerk)\b/i.test(match[1])) queries.push(match[0]);
  }
  return [...new Set(queries)];
}
export function cleanCompany(profile, basis, kvk) {
  const name = profile.eersteHandelsnaam || profile.handelsnamen?.[0]?.naam || '';
  const legalForm = basis._embedded?.eigenaar?.rechtsvorm || '';
  return { name, legalForm, kvk, personal: /eenmanszaak|vof|vennootschap onder firma/i.test(legalForm),
    sbi: (profile.sbiActiviteiten || []).map(x => `${x.sbiCode || ''} ${x.sbiOmschrijving || ''}`.trim()).join('; '), environment: 'KVK test, fictieve gegevens' };
}
export function parsePublications(xml, parser = new DOMParser()) {
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'searchRetrieveResponse') throw new Error('KOOP gaf geen geldig XML-antwoord.');
  const values = (node, name) => [...node.getElementsByTagNameNS('*', name)].map(x => x.textContent.trim());
  if (values(doc, 'diagnostic').length) throw new Error('KOOP heeft de zoekvraag afgewezen.');
  const count = Number(values(doc, 'numberOfRecords')[0]);
  if (!Number.isFinite(count)) throw new Error('Aantal KOOP-resultaten ontbreekt.');
  const records = [...doc.getElementsByTagNameNS('*', 'record')];
  if (count && !records.length) throw new Error('KOOP-records ontbreken.');
  const publications = records.map(record => ({
    id: values(record, 'identifier')[0] || '', title: values(record, 'title')[0] || '',
    summary: values(record, 'abstract')[0] || values(record, 'title')[0] || '',
    date: (values(record, 'available')[0] || '').slice(0, 10), postal: values(record, 'postcodeHuisnummer')
  })).filter(p => /^gmb-\d{4}-\d+$/.test(p.id) && /vergunning/i.test(p.title));
  return { publications, count, next: Number(values(doc, 'nextRecordPosition')[0]) || null };
}

export class LiveClient {
  constructor({ fetcher = globalThis.fetch.bind(globalThis), onTrace = () => {}, onProgress = () => {}, signal } = {}) {
    this.fetcher = fetcher; this.onTrace = onTrace; this.onProgress = onProgress; this.signal = signal; this.calls = []; this.addressCache = new Map();
  }
  async request(base, params = {}, { format = 'json', headers = {} } = {}) {
    const url = new URL(base); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const entry = { service: url.hostname.includes('kvk') ? 'KVK-test' : url.hostname.includes('repository') ? 'KOOP' : 'PDOK',
      endpoint: url.origin + url.pathname, status: null, durationMs: null, at: new Date().toISOString(), ok: false, message: '' };
    this.calls.push(entry); const began = performance.now();
    const timeout = AbortSignal.timeout(30000); const signal = this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
    try {
      const response = await this.fetcher(url.href, { headers: { Accept: format === 'xml' ? 'application/xml' : 'application/json', ...headers }, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      entry.status = response.status;
      if (!response.ok) throw new Error(`${entry.service} antwoordt met HTTP ${response.status}.`);
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 8_000_000) throw new Error('API-antwoord is te groot.');
      const text = await response.text(); if (text.length > 8_000_000) throw new Error('API-antwoord is te groot.');
      const result = format === 'xml' ? text : JSON.parse(text); entry.ok = true; return result;
    } catch (error) {
      entry.message = error.name === 'TimeoutError' ? 'Geen antwoord binnen 30 seconden.' : error.name === 'AbortError' ? 'Proef gestopt.' : entry.status ? error.message : 'De browser kon het antwoord niet lezen. Dit kan een netwerkfout of CORS-beperking zijn. De HTTP-status is onbekend.';
      throw new Error(entry.message);
    } finally { entry.durationMs = Math.round(performance.now() - began); this.onTrace({ ...entry }); }
  }
  async publications({ municipality, from, to, reference = false, maxPublications = 200 }) {
    const creator = municipality === 'Den Haag' ? '(dt.creator=="\'s-Gravenhage" OR dt.creator=="Den Haag")' : `dt.creator=="${municipality}"`;
    const query = reference ? '(' + REFERENCE_IDS.map(id => `dt.identifier=="${id}"`).join(' OR ') + ')' : `c.product-area=="officielepublicaties" AND ${creator} AND dt.available>="${from}" AND dt.available<="${to}"`;
    const result = []; let position = 1, total = 0, truncated = false;
    do {
      const xml = await this.request(API_URLS.koop, { version: '2.0', operation: 'searchRetrieve', query, maximumRecords: 100, startRecord: position }, { format: 'xml' });
      const parsed = parsePublications(xml); total = parsed.count; result.push(...parsed.publications);
      if (!parsed.next) break;
      if (parsed.next <= position) throw new Error('KOOP-paginering loopt vast.');
      position = parsed.next;
      if (position > maxPublications) { truncated = true; break; }
    } while (true);
    return { publications: result, sourceCount: total, truncated };
  }
  async resolve(query, municipality) {
    const cacheKey = municipality + '|' + query;
    if (this.addressCache.has(cacheKey)) return this.addressCache.get(cacheKey);
    const town = municipality === 'Den Haag' ? "'s-Gravenhage" : municipality;
    const response = await this.request(API_URLS.location, { q: query, fq: `type:adres AND gemeentenaam:"${town}"`, rows: 10 });
    const accepted = (response.response?.docs || []).filter(d => {
      if (![norm(municipality), norm(town)].includes(norm(d.gemeentenaam))) return false;
      const exact = norm(d.straatnaam + String(d.huisnummer) + (d.huisletter || '') + (d.huisnummertoevoeging || ''));
      const postal = norm(d.postcode + String(d.huisnummer) + (d.huisletter || '') + (d.huisnummertoevoeging || ''));
      return norm(query) === postal || norm(query) === exact || norm(query).endsWith(exact);
    });
    if (accepted.length !== 1) return null;
    const d = accepted[0]; const objects = []; let url = API_URLS.bag + '/collections/verblijfsobject/items';
    let params = { postcode: d.postcode, huisnummer: d.huisnummer, limit: 1000, f: 'json' };
    while (url) {
      const page = await this.request(url, params); objects.push(...page.features); url = page.links?.find(x => x.rel === 'next')?.href; params = {};
      if (url && !url.startsWith(API_URLS.bag + '/')) throw new Error('Onverwachte BAG-paginering.');
      if (objects.length > 10000) throw new Error('Te veel BAG-objecten op dit adres.');
    }
    const active = objects.filter(f => norm(f.properties.huisletter || '') === norm(d.huisletter || '') && norm(f.properties.toevoeging || '') === norm(d.huisnummertoevoeging || '') && ['Verblijfsobject in gebruik','Verblijfsobject in gebruik (niet ingemeten)','Verblijfsobject gevormd','Verbouwing verblijfsobject'].includes(f.properties.status));
    const uses = active.flatMap(f => Array.isArray(f.properties.gebruiksdoel) ? f.properties.gebruiksdoel : [f.properties.gebruiksdoel]).filter(Boolean);
    const classification = classify(uses);
    if (!['zakelijk', 'maatschappelijk'].includes(classification)) { this.addressCache.set(cacheKey, { classification }); return { classification }; }
    const years = []; const links = [...new Set(active.flatMap(f => f.properties['pand.href'] || []))];
    for (const link of links) {
      if (!link.startsWith(API_URLS.bag + '/collections/pand/items/')) throw new Error('Onverwachte BAG-pandlink.');
      const pand = await this.request(link, { f: 'json' }); if (pand.properties?.bouwjaar) years.push(Number(pand.properties.bouwjaar));
    }
    const [lon, lat] = active[0].geometry?.coordinates || [];
    const result = { classification, address: [d.straatnaam, d.huisnummer, d.huisletter, d.huisnummertoevoeging].filter(Boolean).join(' '),
      postcode: d.postcode, municipality, uses: [...new Set(uses)], area: active.reduce((sum, f) => sum + Number(f.properties.oppervlakte || 0), 0),
      year: years.length ? Math.min(...years) : 0, bagDate: new Date().toLocaleDateString('sv-SE'), bagIds: active.map(f => f.properties.identificatie), lat, lon };
    this.addressCache.set(cacheKey, result); return result;
  }
  async pipeline({ municipality = 'Dordrecht', from, to, reference = false, maxAddresses = 40 }) {
    this.onProgress('Vergunningpublicaties ophalen.');
    const publications = await this.publications({ municipality, from, to, reference });
    const result = { generatedAt: new Date().toISOString(), sourceMode: reference ? 'reference' : 'recent', municipality, from, to,
      sourceCount: publications.sourceCount, publicationCount: publications.publications.length, residential: 0, mixed: 0, unknown: 0, errors: 0, checkedAddresses: 0,
      pendingPublications: 0, addressLimit: maxAddresses, truncated: publications.truncated, leads: [], traces: this.calls };
    const seen = new Set();
    for (let i = 0; i < publications.publications.length; i++) {
      if (this.signal?.aborted) throw new Error('Proef gestopt.');
      const p = publications.publications[i]; const queries = extractAddresses(p);
      if (!queries.length) { result.pendingPublications++; continue; }
      this.onProgress(`BAG-controle van publicatie ${i + 1} van ${publications.publications.length}.`);
      for (const query of queries) {
        if (result.checkedAddresses >= maxAddresses) { result.truncated = true; break; }
        result.checkedAddresses++;
        try {
          const bag = await this.resolve(query, municipality);
          if (!bag || bag.classification === 'onbekend') { result.unknown++; continue; }
          if (bag.classification === 'particulier') { result.residential++; continue; }
          if (bag.classification === 'gemengd') { result.mixed++; continue; }
          const id = p.id + '|' + bag.bagIds.join('-'); if (seen.has(id)) continue; seen.add(id);
          const l = { ...bag, id, publicationId: p.id, date: p.date, summary: p.summary, companies: [], kvkDate: '', companyState: 'not-tested-for-this-address',
            type: /verleen|geweiger|besluit|intrekk/i.test(p.title) ? 'besluit' : 'aanvraag', sourceUrl: 'https://zoek.officielebekendmakingen.nl/' + p.id + '.html', status: 'nieuw', note: '' };
          result.leads.push({ ...l, ...scoreLead(l) });
        } catch (error) { if (this.signal?.aborted) throw error; result.errors++; }
      }
      if (result.checkedAddresses >= maxAddresses) break;
    }
    result.traces = this.calls.map(c => ({ ...c })); return result;
  }
  async kvkTest() {
    const headers = { apikey: PUBLIC_KVK_TEST_KEY }; const base = API_URLS.kvkTest;
    const search = await this.request(base + '/v2/zoeken', { kvkNummer: '68750110' }, { headers });
    const item = search.resultaten?.find(r => r.kvkNummer === '68750110' && r.vestigingsnummer);
    if (!item) throw new Error('KVK-testbedrijf ontbreekt in het zoekantwoord.');
    const profile = await this.request(base + '/v1/vestigingsprofielen/' + item.vestigingsnummer, {}, { headers });
    const basis = await this.request(base + '/v1/basisprofielen/68750110', {}, { headers });
    const company = cleanCompany(profile, basis, '68750110');
    if (!company.name) throw new Error('De KvK-testrespons bevat geen handelsnaam.');
    return { at: new Date().toISOString(), company, status: 'ok', linkedToRealAddress: false, traces: this.calls.map(c => ({ ...c })) };
  }
}
