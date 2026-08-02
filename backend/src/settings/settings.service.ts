import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../entities/app-setting.entity';

export const RESUBMISSION_PAUSED_KEY = 'resubmission_paused';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
  ) {}

  private async getBool(key: string): Promise<boolean> {
    const row = await this.settingRepo.findOne({ where: { key } });
    return row?.boolValue ?? false;
  }

  private async setBool(
    key: string,
    value: boolean,
    updatedBy: string,
  ): Promise<void> {
    await this.settingRepo.save({
      key,
      boolValue: value,
      updatedAt: new Date(),
      updatedBy,
    });
  }

  isResubmissionPaused(): Promise<boolean> {
    return this.getBool(RESUBMISSION_PAUSED_KEY);
  }

  setResubmissionPaused(paused: boolean, adminId: string): Promise<void> {
    return this.setBool(RESUBMISSION_PAUSED_KEY, paused, adminId);
  }
}
