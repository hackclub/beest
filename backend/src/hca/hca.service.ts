import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fetchWithTimeout } from '../fetch.util';
import { User } from '../entities/user.entity';

export interface HcaAddress {
  street_address?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

export interface HcaIdentity {
  sub?: string;
  email?: string;
  name?: string;
  birthdate?: string;
  address?: HcaAddress;
  [key: string]: unknown;
}

@Injectable()
export class HcaService {
  private readonly logger = new Logger(HcaService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    this.clientId = this.config.getOrThrow<string>('CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('CLIENT_SECRET');
    this.baseUrl = this.config.get<string>('HCA_BASE_URL', 'https://auth.hackclub.com');
  }

  async getIdentity(hcaSub: string): Promise<HcaIdentity | null> {
    const user = await this.userRepo.findOne({
      where: { hcaSub },
      select: ['id', 'hcaAccessToken', 'hcaRefreshToken'],
    });

    if (!user?.hcaAccessToken) {
      this.logger.warn(`No HCA tokens stored for ${hcaSub} — user needs to re-login`);
      return null;
    }

    // Try the stored access token first
    let identity = await this.fetchUserinfo(user.hcaAccessToken);
    if (identity) return identity;

    // Access token expired — try refreshing
    if (!user.hcaRefreshToken) {
      this.logger.warn(`HCA access token expired and no refresh token for ${hcaSub}`);
      return null;
    }

    const refreshed = await this.refreshTokens(user.hcaRefreshToken);
    if (!refreshed) {
      this.logger.warn(`HCA token refresh failed for ${hcaSub} — user needs to re-login`);
      return null;
    }

    // Persist rotated tokens
    user.hcaAccessToken = refreshed.accessToken;
    user.hcaRefreshToken = refreshed.refreshToken;
    await this.userRepo.save(user);

    return this.fetchUserinfo(refreshed.accessToken);
  }

  private async fetchUserinfo(accessToken: string): Promise<HcaIdentity | null> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) return null;
      if (!res.ok) {
        this.logger.warn(`HCA userinfo request failed: ${res.status}`);
        return null;
      }
      return (await res.json()) as HcaIdentity;
    } catch (err) {
      this.logger.error(`HCA userinfo fetch error: ${err}`);
      return null;
    }
  }

  private async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`HCA token refresh failed: ${res.status}`);
        return null;
      }
      const data = await res.json();
      if (!data?.access_token) return null;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
      };
    } catch (err) {
      this.logger.error(`HCA token refresh error: ${err}`);
      return null;
    }
  }
}
