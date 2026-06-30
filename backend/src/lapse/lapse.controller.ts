import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewerGuard } from '../admin/reviewer.guard';
import { Project } from '../entities/project.entity';
import { LapseService } from './lapse.service';

@Controller('api/admin/projects')
export class LapseController {
  constructor(
    private readonly lapseService: LapseService,
    @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
  ) {}

  /**
   * Reviewer-gated lookup of Lapse timelapses for a beest project's owner,
   * filtered to the project's linked Hackatime project names. Reviewer never
   * sees the program key or the raw Lapse response — only a whitelisted DTO.
   * Always returns `{ timelapses: [...] }`; empty array means "show nothing".
   */
  @UseGuards(ReviewerGuard)
  @Get(':id/lapse')
  // Confidential: the DTO carries private timelapse playback/thumbnail URLs.
  // Never let them sit in a shared/browser/proxy cache.
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Referrer-Policy', 'no-referrer')
  async getTimelapses(@Param('id', ParseUUIDPipe) id: string) {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const email = project.user?.email ?? null;
    const names = project.hackatimeProjectName ?? [];
    if (!email || names.length === 0) {
      return { timelapses: [] };
    }

    const timelapses = await this.lapseService.findForProject(email, names);
    return { timelapses };
  }
}
