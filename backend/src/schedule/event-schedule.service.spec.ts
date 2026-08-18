import { ConfigService } from '@nestjs/config';
import { EventScheduleService } from './event-schedule.service';
import { fetchWithTimeout } from '../fetch.util';

jest.mock('../fetch.util');

const mockFetch = fetchWithTimeout as jest.MockedFunction<
  typeof fetchWithTimeout
>;

function makeService(
  env: Record<string, string | undefined> = {
    GOOGLE_CALENDAR_ID: 'cal@group.calendar.google.com',
    GOOGLE_CALENDAR_API_KEY: 'test-key',
  },
): EventScheduleService {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new EventScheduleService(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('EventScheduleService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns an empty list without calling Google when unconfigured', async () => {
    const service = makeService({});
    expect(await service.getEvents()).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps Google Calendar items to schedule events', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'evt1',
            summary: 'Opening Ceremony',
            description: '<p>Welcome!</p><p>Bring &amp; share ideas</p>',
            location: 'Main Hall',
            start: { dateTime: '2026-08-29T10:00:00+02:00' },
            end: { dateTime: '2026-08-29T11:00:00+02:00' },
          },
          {
            id: 'evt2',
            summary: 'Beach Day',
            start: { date: '2026-08-31' },
            end: { date: '2026-09-01' },
          },
          {
            id: 'evt3',
            status: 'cancelled',
            summary: 'Cancelled thing',
            start: { dateTime: '2026-08-29T12:00:00+02:00' },
            end: { dateTime: '2026-08-29T13:00:00+02:00' },
          },
          {
            // no id/start/end — dropped
            summary: 'Malformed',
          },
        ],
      }),
    );

    const service = makeService();
    const events = await service.getEvents();

    expect(events).toEqual([
      {
        id: 'evt1',
        title: 'Opening Ceremony',
        description: 'Welcome!\nBring & share ideas',
        location: 'Main Hall',
        start: '2026-08-29T10:00:00+02:00',
        end: '2026-08-29T11:00:00+02:00',
        allDay: false,
      },
      {
        id: 'evt2',
        title: 'Beach Day',
        description: null,
        location: null,
        start: '2026-08-31',
        end: '2026-09-01',
        allDay: true,
      },
    ]);

    const url = mockFetch.mock.calls[0][0] as URL;
    expect(url.pathname).toContain(
      encodeURIComponent('cal@group.calendar.google.com'),
    );
    expect(url.searchParams.get('singleEvents')).toBe('true');
  });

  it('follows nextPageToken across pages', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'a',
              summary: 'A',
              start: { dateTime: '2026-08-30T09:00:00+02:00' },
              end: { dateTime: '2026-08-30T10:00:00+02:00' },
            },
          ],
          nextPageToken: 'page2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'b',
              summary: 'B',
              start: { dateTime: '2026-08-29T09:00:00+02:00' },
              end: { dateTime: '2026-08-29T10:00:00+02:00' },
            },
          ],
        }),
      );

    const service = makeService();
    const events = await service.getEvents();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondUrl = mockFetch.mock.calls[1][0] as URL;
    expect(secondUrl.searchParams.get('pageToken')).toBe('page2');
    // Sorted by start across pages.
    expect(events.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('caches results between calls', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ items: [] }));

    const service = makeService();
    await service.getEvents();
    await service.getEvents();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('serves the last successful fetch when Google errors', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'a',
              summary: 'A',
              start: { dateTime: '2026-08-29T09:00:00+02:00' },
              end: { dateTime: '2026-08-29T10:00:00+02:00' },
            },
          ],
        }),
      );

      const service = makeService();
      const first = await service.getEvents();
      expect(first).toHaveLength(1);

      // Expire the cache, then fail the refetch.
      jest.advanceTimersByTime(6 * 60_000);
      mockFetch.mockRejectedValueOnce(new Error('boom'));

      expect(await service.getEvents()).toEqual(first);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns an empty list when the first fetch fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 403));

    const service = makeService();
    expect(await service.getEvents()).toEqual([]);
  });
});
