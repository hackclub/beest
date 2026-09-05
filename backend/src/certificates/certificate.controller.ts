import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
  Res,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CertificateService } from './certificate.service';

@Controller('api/certificates')
export class CertificateController {
  private readonly logger = new Logger(CertificateController.name);

  constructor(private readonly certificateService: CertificateService) {}

  @UseGuards(JwtAuthGuard)
  @Get('/')
  async getUserCertificates(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.certificateService.getCertificatesForUser(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/detail/:id')
  async getCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    const certificate = await this.certificateService.getCertificateById(id);

    // Ensure user owns this certificate
    if (certificate.userId !== userId) {
      throw new ForbiddenException('You do not own this certificate');
    }

    return certificate;
  }

  @UseGuards(JwtAuthGuard)
  @Get('/order/:orderId')
  async getCertificateByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    const certificate = await this.certificateService.getCertificateByOrderId(orderId);
    if (!certificate) {
      return null;
    }

    // Ensure user owns this certificate
    if (certificate.userId !== userId) {
      throw new ForbiddenException('You do not own this certificate');
    }

    return certificate;
  }

  @Get('/verify/:certificateNumber')
  async verifyCertificate(
    @Param('certificateNumber') certificateNumber: string,
  ) {
    const certificate = await this.certificateService.getCertificateByNumber(certificateNumber.trim());
    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return {
      certificateNumber: certificate.certificateNumber,
      recipientName: certificate.recipientName,
      approvedHours: certificate.approvedHours,
      awardItem: certificate.awardItem,
      certificateText: certificate.certificateText,
      createdAt: certificate.createdAt,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('/sync')
  async syncCertificates(@Req() req: Request) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    await this.certificateService.syncCertificatesForUser(userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:id/view')
  async viewCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    const certificate = await this.certificateService.getCertificateById(id);

    // Ensure user owns this certificate
    if (certificate.userId !== userId) {
      throw new ForbiddenException('You do not own this certificate');
    }

    const html = this.certificateService.generateCertificateHtml(certificate);
    res.type('text/html').send(html);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:id/download')
  async downloadCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    const certificate = await this.certificateService.getCertificateById(id);

    // Ensure user owns this certificate
    if (certificate.userId !== userId) {
      throw new ForbiddenException('You do not own this certificate');
    }

    const pdf = await this.certificateService.generateCertificatePdf(certificate);
    const filename = `Certificate_${certificate.recipientName.replace(/\s+/g, '_')}_${certificate.certificateNumber}.pdf`;

    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdf);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/:id/thumbnail')
  async getThumbnail(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any).user?.uid;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }

    const certificate = await this.certificateService.getCertificateById(id);
    if (certificate.userId !== userId) {
      throw new ForbiddenException('You do not own this certificate');
    }

    const cacheDir = path.join(os.tmpdir(), 'beest-cert-thumbs');
    const filename = `${certificate.id}.png`;
    const filepath = path.join(cacheDir, filename);

    try {
      // ensure cache dir exists
      await fs.mkdir(cacheDir, { recursive: true });

      // if cached file exists, serve it
      try {
        const stat = await fs.stat(filepath);
        if (stat && stat.size > 0) {
          const data = await fs.readFile(filepath);
          res.type('image/png').setHeader('Cache-Control', 'public, max-age=86400').send(data);
          return;
        }
      } catch (e) {
        // file doesn't exist — fallthrough to generate
      }

      // generate PNG and cache
      const png = await this.certificateService.generateCertificatePng(certificate);
      await fs.writeFile(filepath, png);
      res.type('image/png').setHeader('Cache-Control', 'public, max-age=86400').send(png);
    } catch (error) {
      this.logger.error('Failed to produce thumbnail:', error);
      throw new InternalServerErrorException('Failed to generate thumbnail');
    }
  }
}
