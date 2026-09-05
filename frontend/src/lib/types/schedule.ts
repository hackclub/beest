// Mirrors ScheduleEvent in backend/src/schedule/event-schedule.service.ts
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
