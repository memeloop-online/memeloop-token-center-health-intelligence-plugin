import type {
  AixHanSnapshot,
  CodexRadarSnapshot,
  DeepSweSnapshot,
  HealthIntelligenceSnapshot,
  SourceSnapshot,
} from '../shared/types.js';
import { fetchSnapshot } from './api.js';
import './styles.css';

const root = document.querySelector<HTMLElement>('#health-intelligence-root');

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className?: string): HTMLElementTagNameMap[K] {
  const node = element(tag, className);
  node.textContent = value;
  return node;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatNumber(value: number | null, digits = 0): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function sourceStatus(source: SourceSnapshot): string {
  if (source.status === 'ok') return 'Fresh';
  if (source.status === 'stale') return 'Stale cache';
  return 'Unavailable';
}

function sourceHeader(source: SourceSnapshot): HTMLElement {
  const header = element('div', 'source-header');
  const title = element('div');
  title.append(text('h2', source.label));
  title.append(text('p', `Updated ${formatDate(source.sourceUpdatedAt)}`, 'source-updated'));
  const status = text('span', sourceStatus(source), `source-status ${source.status}`);
  header.append(title, status);
  return header;
}

function sourceFooter(source: SourceSnapshot): HTMLElement {
  const footer = element('footer', 'source-footer');
  footer.append(text('span', `Fetched ${formatDate(source.fetchedAt)}`));
  if (source.ageSeconds !== null) footer.append(text('span', `${formatNumber(source.ageSeconds)}s old`));
  const link = element('a');
  link.textContent = 'Public source ↗';
  link.href = source.pageUrl;
  link.target = '_blank';
  link.rel = 'noreferrer noopener';
  footer.append(link);
  return footer;
}

function bar(label: string, value: string, ratio: number | null): HTMLElement {
  const row = element('div', 'bar-row');
  const heading = element('div', 'bar-heading');
  heading.append(text('span', label), text('b', value));
  row.append(heading);
  const track = element('div', 'bar-track');
  const fill = element('i');
  fill.style.width = `${Math.max(0, Math.min(100, (ratio ?? 0) * 100))}%`;
  track.append(fill);
  row.append(track);
  return row;
}

function codexRadar(source: CodexRadarSnapshot): HTMLElement {
  const body = element('div', 'source-body');
  if (source.rows.length === 0) return body.appendChild(text('p', 'No valid public rows returned.', 'empty')) as HTMLElement;
  const maxIq = Math.max(...source.rows.map((row) => row.iq), 1);
  for (const row of source.rows.slice(0, 6)) {
    const label = `${row.model} · ${row.effort}`;
    body.append(bar(label, `IQ ${formatNumber(row.iq, 1)}`, row.iq / maxIq));
    body.append(text('small', `${row.samples.toLocaleString()} samples · software ${formatNumber(row.softwareIq, 1)} · visual ${formatNumber(row.visualIq, 1)}`, 'row-note'));
  }
  return body;
}

function deepSwe(source: DeepSweSnapshot): HTMLElement {
  const body = element('div', 'source-body');
  if (source.rows.length === 0) return body.appendChild(text('p', 'No valid public rows returned.', 'empty')) as HTMLElement;
  for (const row of source.rows.slice(0, 6)) {
    body.append(bar(`${row.model} · ${row.effort}`, `${formatNumber(row.passRate * 100, 1)}% pass@1`, row.passRate));
    const cost = row.averageCostUsd === null ? 'cost —' : `cost $${formatNumber(row.averageCostUsd, 2)}`;
    body.append(text('small', `${cost} · ${formatNumber(row.outputTokens)} output tokens · ${formatNumber(row.agentSteps)} steps`, 'row-note'));
  }
  return body;
}

function aixHan(source: AixHanSnapshot): HTMLElement {
  const body = element('div', 'source-body health-list');
  if (source.rows.length === 0) return body.appendChild(text('p', 'No valid public rows returned.', 'empty')) as HTMLElement;
  for (const row of source.rows.slice(0, 8)) {
    const item = element('div', 'health-row');
    const identity = element('div');
    identity.append(text('b', row.name), text('small', `${row.model ?? 'model —'} · checked ${formatDate(row.checkedAt)}`));
    const state = text('span', row.status, `health-pill ${row.status}`);
    item.append(identity, state);
    const detail = row.latencyMs === null ? 'latency —' : `${formatNumber(row.latencyMs)}ms latency`;
    item.append(text('small', `${detail}${row.message ? ` · ${row.message}` : ''}`, 'row-note'));
    body.append(item);
  }
  return body;
}

function card(source: SourceSnapshot): HTMLElement {
  const article = element('article', `source-card ${source.status}`);
  article.append(sourceHeader(source));
  if (source.status === 'error' && source.error) article.append(text('p', source.error, 'source-error'));
  if (source.id === 'codexradar') article.append(codexRadar(source));
  else if (source.id === 'deepswe') article.append(deepSwe(source));
  else article.append(aixHan(source));
  article.append(sourceFooter(source));
  return article;
}

function renderLoading(host: HTMLElement): void {
  host.replaceChildren(text('p', 'Loading public signals…', 'loading'));
}

function renderError(host: HTMLElement, message: string, retry: () => void): void {
  host.replaceChildren();
  const notice = element('div', 'notice error');
  notice.append(text('p', message));
  const button = text('button', 'Try again');
  button.type = 'button';
  button.addEventListener('click', retry);
  notice.append(button);
  host.append(notice);
}

function renderSnapshot(host: HTMLElement, snapshot: HealthIntelligenceSnapshot, refresh: () => void): void {
  host.replaceChildren();
  const header = element('header', 'tab-header');
  const heading = element('div');
  heading.append(text('p', 'MONITORING · PUBLIC READ-ONLY', 'eyebrow'));
  heading.append(text('h1', 'Health and intelligence'));
  heading.append(text('p', 'Three independent public signals, normalized by the plugin server.', 'lede'));
  const button = text('button', 'Refresh');
  button.type = 'button';
  button.addEventListener('click', refresh);
  header.append(heading, button);
  host.append(header);
  const statuses = snapshot.sources.filter((source) => source.status !== 'ok');
  if (statuses.length > 0) {
    const notice = element('div', `notice ${statuses.every((source) => source.status === 'error') ? 'error' : 'warning'}`);
    notice.textContent = statuses.every((source) => source.status === 'error')
      ? 'All public sources are currently unavailable.'
      : `${statuses.length} public source${statuses.length === 1 ? '' : 's'} returned stale or unavailable data.`;
    host.append(notice);
  }
  const grid = element('section', 'source-grid');
  grid.setAttribute('aria-label', 'Public health and intelligence sources');
  for (const source of snapshot.sources) grid.append(card(source));
  host.append(grid);
  host.append(text('p', `Plugin snapshot generated ${formatDate(snapshot.generatedAt)}. Public data is informational and not an endorsement.`, 'disclaimer'));
}

export function mountHealthIntelligenceTab(host: HTMLElement): void {
  let loading = false;
  const refresh = async (force = false) => {
    if (loading) return;
    loading = true;
    renderLoading(host);
    try {
      const snapshot = await fetchSnapshot(force);
      renderSnapshot(host, snapshot, () => { void refresh(true); });
    } catch {
      renderError(host, 'Public health data is temporarily unavailable.', () => { void refresh(true); });
    } finally {
      loading = false;
    }
  };
  void refresh();
}

if (root) mountHealthIntelligenceTab(root);
