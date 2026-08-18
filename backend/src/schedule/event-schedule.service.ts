import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../fetch.util';

export interface ScheduleEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO 8601 datetime, or YYYY-MM-DD when allDay. */
  start: string;
  /** ISO 8601 datetime, or YYYY-MM-DD (exclusive) when allDay. */
  end: string;
  allDay: boolean;
}

interface GoogleCalendarItem {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface GoogleCalendarEventsPage {
  items?: GoogleCalendarItem[];
  nextPageToken?: string;
}

/**
 * Read-only integration with the Google Calendar API backing the public
 * /schedule page. The calendar must be public and the key a plain API key
 * with the Calendar API enabled — no OAuth involved. Degrades to an empty
 * list when unconfigured or when Google is unreachable (serving the last
 * successful fetch if there is one), so the schedule page never 500s.
 */
@Injectable()
export class EventScheduleService {
  private readonly logger = new Logger(EventScheduleService.name);
  private readonly calendarId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly configured: boolean;

  private cache: { events: ScheduleEvent[]; timestamp: number } | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60_000;

  // The event weekend (Aug 29–31, Europe/Amsterdam) padded a day on each
  // side so timezone offsets and overnight events never clip at the edges.
  private static readonly TIME_MIN = '2026-08-28T00:00:00Z';
  private static readonly TIME_MAX = '2026-09-01T23:59:59Z';

  constructor(private configService: ConfigService) {
    this.calendarId = this.configService.get('GOOGLE_CALENDAR_ID');
    this.apiKey = this.configService.get('GOOGLE_CALENDAR_API_KEY');
    this.configured = !!this.calendarId && !!this.apiKey;
    if (!this.configured) {
      this.logger.warn(
        'GOOGLE_CALENDAR_ID / GOOGLE_CALENDAR_API_KEY not set; /schedule shows no events',
      );
    }
  }

  async getEvents(): Promise<ScheduleEvent[]> {
    if (!this.configured) return [];

    if (
      this.cache &&
      Date.now() - this.cache.timestamp < EventScheduleService.CACHE_TTL_MS
    ) {
      return this.cache.events;
    }

    try {
      const events = await this.fetchAllEvents();
      this.cache = { events, timestamp: Date.now() };
      return events;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Google Calendar fetch failed: ${message}`);
      // Stale is better than empty while Google blips.
      return this.cache?.events ?? [];
    }
  }

  private async fetchAllEvents(): Promise<ScheduleEvent[]> {
    const events: ScheduleEvent[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId!)}/events`,
      );
      url.searchParams.set('key', this.apiKey!);
      url.searchParams.set('timeMin', EventScheduleService.TIME_MIN);
      url.searchParams.set('timeMax', EventScheduleService.TIME_MAX);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '250');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const page = (await res.json()) as GoogleCalendarEventsPage;
      for (const item of page.items ?? []) {
        const mapped = EventScheduleService.mapItem(item);
        if (mapped) events.push(mapped);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return events.sort((a, b) => a.start.localeCompare(b.start));
  }

  private static mapItem(item: GoogleCalendarItem): ScheduleEvent | null {
    if (item.status === 'cancelled') return null;
    const start = item.start?.dateTime ?? item.start?.date;
    const end = item.end?.dateTime ?? item.end?.date;
    if (!item.id || !start || !end) return null;

    return {
      id: item.id,
      title: item.summary?.trim() || 'Untitled event',
      description: EventScheduleService.stripHtml(item.description),
      location: item.location?.trim() || null,
      start,
      end,
      allDay: !item.start?.dateTime,
    };
  }

  /** Google Calendar descriptions are HTML; the schedule renders plain text. */
  private static stripHtml(html: string | undefined): string | null {
    if (!html) return null;
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    return text || null;
  }
}
