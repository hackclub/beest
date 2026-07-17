import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../fetch.util';

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

@Injectable()
export class RsvpService {
  private readonly pendingEmails = new Set<string>();
  private readonly airtableApiKey: string;
  private readonly airtableBaseId: string;
  private readonly airtableTableName: string;

  constructor(private readonly config: ConfigService) {
    this.airtableApiKey = this.config.getOrThrow<string>('AIRTABLE_API_KEY');
    this.airtableBaseId = this.config.getOrThrow<string>('AIRTABLE_BASE_ID');
    this.airtableTableName = this.config.getOrThrow<string>(
      'AIRTABLE_TABLE_NAME',
    );
  }

  private sanitizeEmail(raw: string): string {
    return raw.trim().slice(0, 254).replace(/[<>"'&\\]/g, '');
  }

  /**
   * Escapes a string for safe use inside an Airtable filterByFormula value.
   * Doubles any backslashes first, then escapes double-quotes.
   * The value is wrapped in double-quotes by the caller.
   */
  private escapeAirtableValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private get baseUrl(): string {
    return `https://api.airtable.com/v0/${this.airtableBaseId}/${encodeURIComponent(this.airtableTableName)}`;
  }

  async createRsvp(rawEmail: string): Promise<{ success: true; existing: boolean }> {
    const email = this.sanitizeEmail(rawEmail);

    if (!EMAIL_RE.test(email)) {
      throw new BadRequestException('Invalid email address');
    }

    if (this.pendingEmails.has(email)) {
      throw new HttpException('RSVP already in progress', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.pendingEmails.add(email);

    try {
      const existing = await this.checkExisting(email);
      if (existing) {
        return { success: true, existing: true };
      }

      await this.createRecord(email);
      return { success: true, existing: false };
    } finally {
      this.pendingEmails.delete(email);
    }
  }

  private async checkExisting(email: string): Promise<boolean> {
    const searchParams = new URLSearchParams({
      filterByFormula: `{Email} = "${this.escapeAirtableValue(email)}"`,
      maxRecords: '1',
    });

    const res = await fetchWithTimeout(`${this.baseUrl}?${searchParams}`, {
      headers: { Authorization: `Bearer ${this.airtableApiKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable lookup error:', res.status, text);
      throw new HttpException('Failed to check RSVP', HttpStatus.BAD_GATEWAY);
    }

    const data = await res.json();
    return data.records?.length > 0;
  }

  async findRecordIdByEmail(rawEmail: string): Promise<string | null> {
    const email = this.sanitizeEmail(rawEmail);
    const searchParams = new URLSearchParams({
      filterByFormula: `{Email} = "${this.escapeAirtableValue(email)}"`,
      maxRecords: '1',
    });

    const res = await fetchWithTimeout(`${this.baseUrl}?${searchParams}`, {
      headers: { Authorization: `Bearer ${this.airtableApiKey}` },
    });

    if (!res.ok) {
      throw new HttpException('Failed to find Airtable record', HttpStatus.BAD_GATEWAY);
    }

    const data = await res.json();
    return data.records?.[0]?.id ?? null;
  }

  async updatePerms(rawEmail: string, perms: string): Promise<void> {
    const recordId = await this.findRecordIdByEmail(rawEmail);
    if (!recordId) {
      throw new HttpException('User not found in Airtable', HttpStatus.NOT_FOUND);
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/${recordId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.airtableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: { Perms: perms } }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable update error:', res.status, text);
      throw new HttpException('Failed to update permissions', HttpStatus.BAD_GATEWAY);
    }
  }

  /** Clears the Perms field. Pairs with getPerms() — `null` perms ≠ Banned. */
  async clearPerms(rawEmail: string): Promise<void> {
    await this.updatePerms(rawEmail, '');
  }

  /** Records the home "hackathon or shop?" answer onto the user's RSVP record. */
  async setIntent(rawEmail: string, intent: string): Promise<void> {
    const recordId = await this.findRecordIdByEmail(rawEmail);
    if (!recordId) {
      throw new HttpException('User not found in Airtable', HttpStatus.NOT_FOUND);
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/${recordId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.airtableApiKey}`,
        'Content-Type': 'application/json',
      },
      // typecast lets Airtable create the single-select option if it doesn't
      // exist yet (e.g. the new "Browsing"/"Both" choices).
      body: JSON.stringify({ typecast: true, fields: { Intent: intent } }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable intent update error:', res.status, text);
      throw new HttpException('Failed to record intent', HttpStatus.BAD_GATEWAY);
    }
  }

  async getPerms(rawEmail: string): Promise<string | null> {
    const email = this.sanitizeEmail(rawEmail);
    const searchParams = new URLSearchParams({
      filterByFormula: `{Email} = "${this.escapeAirtableValue(email)}"`,
      maxRecords: '1',
    });
    searchParams.append('fields[]', 'Perms');

    const res = await fetchWithTimeout(`${this.baseUrl}?${searchParams}`, {
      headers: { Authorization: `Bearer ${this.airtableApiKey}` },
    });

    if (!res.ok) {
      throw new HttpException(
        'Failed to check permissions',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data = await res.json();
    return data.records?.[0]?.fields?.Perms ?? null;
  }

  /**
   * Fetches the Airtable `createdTime` of every RSVP/user record, sorted
   * ascending.
   *
   * SAFETY: this method is the sole Airtable data source for admin stats
   * (sign-ups chart + funnel). It must never pull records from any table
   * other than the RSVP/user table — not Projects, not Approved Projects,
   * not anything in the unified base. The allowed URL prefix is frozen on
   * entry and every paged fetch is asserted against it.
   */
  async getAllSignupTimestamps(): Promise<string[]> {
    const allowedPrefix = `https://api.airtable.com/v0/${this.airtableBaseId}/${encodeURIComponent(this.airtableTableName)}`;

    const timestamps: string[] = [];
    let offset: string | undefined;

    do {
      const searchParams = new URLSearchParams();
      searchParams.append('pageSize', '100');
      searchParams.append('fields[]', 'Email'); // limit payload — we only use createdTime
      if (offset) searchParams.append('offset', offset);

      const url = `${this.baseUrl}?${searchParams}`;
      if (!url.startsWith(`${allowedPrefix}?`)) {
        throw new HttpException(
          'Sign-up stats fetch blocked: URL does not target the RSVP/user table',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const res = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${this.airtableApiKey}` },
      });

      if (!res.ok) break;

      const data = await res.json();
      for (const record of data.records ?? []) {
        if (record.createdTime) timestamps.push(record.createdTime);
      }
      offset = data.offset;
    } while (offset);

    timestamps.sort();
    return timestamps;
  }

  async getAllPerms(): Promise<Map<string, string>> {
    const permsMap = new Map<string, string>();
    let offset: string | undefined;

    do {
      const searchParams = new URLSearchParams();
      searchParams.append('fields[]', 'Email');
      searchParams.append('fields[]', 'Perms');
      searchParams.append('pageSize', '100');
      if (offset) searchParams.append('offset', offset);

      const res = await fetchWithTimeout(`${this.baseUrl}?${searchParams}`, {
        headers: { Authorization: `Bearer ${this.airtableApiKey}` },
      });

      if (!res.ok) break;

      const data = await res.json();
      for (const record of data.records ?? []) {
        const email = record.fields?.Email;
        const perms = record.fields?.Perms;
        if (email) permsMap.set(email.toLowerCase(), perms ?? 'User');
      }
      offset = data.offset;
    } while (offset);

    return permsMap;
  }

  /**
   * Sets a date field in Airtable for Loops sync, only if not already set.
   * Fire-and-forget — logs errors but never throws.
   */
  async updateDateField(rawEmail: string, fieldName: string): Promise<void> {
    try {
      const email = this.sanitizeEmail(rawEmail);
      const searchParams = new URLSearchParams({
        filterByFormula: `{Email} = "${this.escapeAirtableValue(email)}"`,
        maxRecords: '1',
      });
      searchParams.append('fields[]', fieldName);

      const lookupRes = await fetchWithTimeout(`${this.baseUrl}?${searchParams}`, {
        headers: { Authorization: `Bearer ${this.airtableApiKey}` },
      });
      if (!lookupRes.ok) return;

      const data = await lookupRes.json();
      const record = data.records?.[0];
      if (!record) return;

      // Skip if the field already has a value
      if (record.fields?.[fieldName]) return;

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const res = await fetchWithTimeout(`${this.baseUrl}/${record.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.airtableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { [fieldName]: today } }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Airtable updateDateField(${fieldName}) error:`, res.status, text);
      }
    } catch (err) {
      console.error(`Airtable updateDateField(${fieldName}) failed:`, err);
    }
  }


  async createApprovedProjectRecord(fields: Record<string, any>): Promise<void> {
    const tableName = this.config.get<string>('AIRTABLE_PROJECTS_TABLE_NAME', 'Projects');
    const url = `https://api.airtable.com/v0/${this.airtableBaseId}/${encodeURIComponent(tableName)}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.airtableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields }] }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable createApprovedProjectRecord error:', res.status, text);
      throw new Error(`Airtable API error (${res.status}): ${text}`);
    }
  }

  private async createRecord(email: string): Promise<void> {
    const res = await fetchWithTimeout(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.airtableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{ fields: { Email: email } }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable error:', res.status, text);
      throw new HttpException('Failed to save RSVP', HttpStatus.BAD_GATEWAY);
    }
  }
}
