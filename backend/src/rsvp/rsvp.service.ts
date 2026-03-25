import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
      filterByFormula: `{Email} = '${email.replace(/'/g, "\\'")}'`,
      maxRecords: '1',
    });

    const res = await fetch(`${this.baseUrl}?${searchParams}`, {
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

  private async createRecord(email: string): Promise<void> {
    const res = await fetch(this.baseUrl, {
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
