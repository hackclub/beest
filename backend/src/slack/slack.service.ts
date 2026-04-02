import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../fetch.util';

export type SlackMembershipStatus = 'full_member' | 'guest' | 'not_found';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly botToken: string | undefined;
  private readonly configured: boolean;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get('SLACK_BOT_TOKEN');
    this.configured = !!this.botToken;
    if (!this.configured) {
      this.logger.warn('SLACK_BOT_TOKEN not set — Slack membership checks disabled');
    }
  }

  async checkMembership(email: string): Promise<SlackMembershipStatus> {
    if (!this.configured) {
      throw new Error('Slack integration is not configured');
    }

    const res = await fetchWithTimeout(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${this.botToken}` } },
    );

    if (!res.ok) {
      this.logger.error(`Slack API HTTP error: ${res.status}`);
      throw new Error('Slack API request failed');
    }

    const data = await res.json();

    if (!data.ok) {
      if (data.error === 'users_not_found') {
        return 'not_found';
      }
      this.logger.error(`Slack API error: ${data.error}`);
      throw new Error(`Slack API error: ${data.error}`);
    }

    const user = data.user;
    if (user.is_restricted || user.is_ultra_restricted) {
      return 'guest';
    }

    return 'full_member';
  }
}
