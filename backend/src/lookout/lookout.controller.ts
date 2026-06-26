import {
    Controller,
    Get,
    Post,
    Param,
    ParseUUIDPipe,
    Req,
    UseGuards,
    NotFoundException,
    ForbiddenException,
    UnauthorizedException,
    ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Project } from '../entities/project.entity';
import { LookoutService } from './lookout.service';

@Controller('api/projects')
export class LookoutController {
    constructor(
        private readonly lookout: LookoutService,
        @InjectRepository(Project) private readonly projectRepo: Repository<Project>,
    ) {}

    private async ownProjectOrThrow(id: string, userId: string): Promise<Project> {
        if (!userId) throw new UnauthorizedException('No user identity');
        const project = await this.projectRepo.findOne({ where: { id } });
        if (!project) throw new NotFoundException('Project not found');
        if (project.userId !== userId) throw new ForbiddenException('Not your project');
        return project;
    }

    @UseGuards(JwtAuthGuard)
    @Post(':id/lookout/session')
    async createSession(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() req: Request,
    ) {
        const userId = (req as any).user?.uid;
        await this.ownProjectOrThrow(id, userId);

        const created = await this.lookout.createSession(userId, id);
        if (!created) {
            throw new ServiceUnavailableException('Lookout is unavailable');
        }

        const row = await this.lookout.saveSession(userId, id, created);

        // `id` lets the devlog form attach this session on submit; `token` lets
        // the client deep-link into the Lookout desktop app (lookout://session?token=…).
        return { id: row.id, token: created.token, sessionUrl: created.sessionUrl };
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/lookout')
    async listMine(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
        const userId = (req as any).user?.uid;
        await this.ownProjectOrThrow(id, userId);

        return { sessions: await this.lookout.listUnattached(id, userId) };
    }
}
