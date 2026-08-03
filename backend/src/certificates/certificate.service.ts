import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as puppeteer from 'puppeteer';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Certificate } from '../entities/certificate.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepo: Repository<Certificate>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Generate a certificate for a non-granted fulfilled order.
   * Called when an order is marked as fulfilled.
   *
   * Only creates certificates for orders without hcbCardGrantId or siloGrantId.
   */
  async generateCertificateForOrder(
    orderId: string,
  ): Promise<Certificate | null> {
    const existingCertificate = await this.certificateRepo.findOne({
      where: { orderId },
    });
    if (existingCertificate) {
      return existingCertificate;
    }

    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['user'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Only generate certificates for non-granted items
    if (order.hcbCardGrantId || order.siloGrantId) {
      this.logger.debug(
        `Skipping certificate generation for granted order ${orderId}`,
      );
      return null;
    }

    const user =
      order.user ||
      (await this.userRepo.findOne({ where: { id: order.userId } }));
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // The certificate represents the item price in Pipes, captured at purchase time.
    const approvedHours = order.pipesSpent;

    // Generate unique certificate number
    const certificateNumber = await this.generateCertificateNumber();

    // Format the certificate text
    const recipientName = user.nickname || user.name || 'Recipient';
    const certificateText = this.formatCertificateText(
      recipientName,
      approvedHours,
      order.itemName,
    );

    // Create and save the certificate
    const certificate = this.certificateRepo.create({
      userId: order.userId,
      orderId: order.id,
      recipientName,
      approvedHours,
      awardItem: order.itemName,
      certificateNumber,
      certificateText,
    });

    const saved = await this.certificateRepo.save(certificate);

    await this.auditLogService.log(
      order.userId,
      'certificate_generated',
      `Certificate generated for order ${order.id}: ${order.itemName}`,
    );

    return saved;
  }

  /**
   * Backfill certificates for any fulfilled orders that were missed earlier.
   * Safe to call on page load because generateCertificateForOrder() is idempotent.
   */
  async syncCertificatesForUser(userId: string): Promise<void> {
    const fulfilledOrders = await this.orderRepo.find({
      where: { userId, status: 'fulfilled' },
      select: ['id'],
    });

    if (!fulfilledOrders.length) {
      return;
    }

    const existingCertificates = await this.certificateRepo.find({
      where: { userId },
      select: ['orderId'],
    });
    const existingOrderIds = new Set(
      existingCertificates.map((c) => c.orderId),
    );

    for (const order of fulfilledOrders) {
      if (existingOrderIds.has(order.id)) {
        continue;
      }

      try {
        await this.generateCertificateForOrder(order.id);
      } catch (error) {
        this.logger.error(
          `Failed to backfill certificate for order ${order.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Generate a unique certificate number
   * Format: CERT-YYYY-RANDOM. Randomness avoids collisions during concurrent fulfilments.
   */
  private async generateCertificateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return `CERT-${year}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  /**
   * Format the certificate text
   */
  private formatCertificateText(
    recipientName: string,
    approvedHours: number,
    awardItem: string,
  ): string {
    return `This certificate recognizes ${recipientName}'s fulfilled Beest by Hack Club shop order. ${recipientName} is hereby awarded ${awardItem}, purchased for ${approvedHours} Pipes.`;
  }

  /**
   * Generate PDF for the certificate
   */
  async generateCertificatePdf(certificate: Certificate): Promise<Buffer> {
    const html = this.generateCertificateHtml(certificate);

    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        landscape: true,
      });

      return Buffer.from(pdf);
    } catch (error) {
      this.logger.error('Failed to generate certificate PDF:', error);
      throw new BadRequestException('Failed to generate certificate PDF');
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Generate a PNG screenshot for the certificate HTML.
   */
  async generateCertificatePng(certificate: Certificate): Promise<Buffer> {
    const html = this.generateCertificateHtml(certificate);
    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      // reasonable viewport for a certificate thumbnail/full preview
      await page.setViewport({
        width: 1400,
        height: 900,
        deviceScaleFactor: 1,
      });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // capture a PNG of the visible viewport
      const png = await page.screenshot({ type: 'png', omitBackground: false });
      return Buffer.from(png);
    } catch (error) {
      this.logger.error('Failed to generate certificate PNG:', error);
      throw new BadRequestException('Failed to generate certificate thumbnail');
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Generate HTML for the certificate (styled e-certificate with logo)
   */
  generateLegacyCertificateHtml(certificate: Certificate): string {
    const {
      recipientName,
      approvedHours,
      awardItem,
      certificateNumber,
      createdAt,
    } = certificate;
    const formattedDate = new Date(createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificate of Achievement - ${recipientName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Georgia', 'Garamond', serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }

    .certificate-container {
      width: 100%;
      max-width: 900px;
      height: 100vh;
      max-height: 600px;
      background: linear-gradient(to bottom, #fff9f0 0%, #ffffff 50%, #f0f8ff 100%);
      border: 4px solid #d4af37;
      box-shadow:
        0 0 30px rgba(0, 0, 0, 0.3),
        inset 0 0 0 2px #e8d5b7,
        inset 0 0 0 4px #d4af37;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 60px;
    }

    .certificate-container::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 200%;
      height: 200%;
      background:
        radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.05) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(118, 75, 162, 0.05) 0%, transparent 50%);
      animation: float 20s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-20px, -20px); }
      50% { transform: translate(-40px, -40px); }
      75% { transform: translate(-20px, -20px); }
    }

    .certificate-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
    }

    .logo-section {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 15px;
      margin-bottom: 5px;
    }

    .hack-club-logo {
      height: 50px;
      display: flex;
      align-items: center;
      font-weight: bold;
      font-size: 22px;
      color: #d4af37;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
    }

    .logo-separator {
      width: 3px;
      height: 35px;
      background: linear-gradient(to bottom, #667eea, #764ba2);
      border-radius: 2px;
    }

    .beest-text {
      font-size: 20px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 2px;
    }

    .certificate-title {
      font-size: 36px;
      font-weight: bold;
      color: #333;
      margin: 15px 0 10px;
      letter-spacing: 3px;
      text-transform: uppercase;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .certificate-text {
      font-size: 14px;
      line-height: 1.6;
      color: #444;
      max-width: 700px;
      margin: 10px 0;
      font-style: italic;
    }

    .recipient-name {
      font-size: 28px;
      font-weight: bold;
      color: #d4af37;
      margin: 10px 0;
      letter-spacing: 1px;
      text-decoration: underline;
      text-decoration-style: wavy;
      text-decoration-color: #667eea;
      text-underline-offset: 6px;
    }

    .footer-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 2px solid #d4af37;
    }

    .signature-block {
      text-align: center;
      flex: 1;
    }

    .signature-line {
      width: 150px;
      height: 2px;
      background: linear-gradient(to right, #667eea, #764ba2);
      margin: 8px auto 3px;
      border-radius: 1px;
    }

    .signature-title {
      font-size: 11px;
      color: #666;
      font-weight: bold;
      letter-spacing: 0.5px;
    }

    .certificate-number {
      font-size: 10px;
      color: #999;
      margin-top: 10px;
      font-family: 'Courier New', monospace;
      letter-spacing: 1px;
    }

    .date-issued {
      font-size: 12px;
      color: #667eea;
      font-weight: 600;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .certificate-container {
        box-shadow: none;
        max-width: 100%;
        aspect-ratio: auto;
        height: 11in;
        width: 14in;
      }
    }
  </style>
</head>
<body>
  <div class="certificate-container">
    <div class="certificate-content">
      <div class="logo-section">
        <div class="hack-club-logo">🚩</div>
        <div class="logo-separator"></div>
        <div class="beest-text">BEEST</div>
      </div>

      <div class="certificate-title">Certificate of Achievement</div>

      <div class="certificate-text">
        This is to certify that
      </div>

      <div class="recipient-name">${recipientName}</div>

      <div class="certificate-text">
        has successfully completed a project comprising <strong>${approvedHours} approved hours</strong> under the Beest by Hack Club program. In recognition of the successful completion of this project, <strong>${recipientName}</strong> is hereby awarded <strong>${awardItem}</strong> in commendation of their dedication, perseverance, and technical excellence, and in recognition of their exceptional merit and ability.
      </div>

      <div class="footer-section">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div class="signature-title">Euan Ripper</div>
          <div class="date-issued">Organizer<br>YSWS</div>
        </div>
        <div class="signature-block">
          <div class="signature-title">Zach Latta</div>
          <div class="date-issued">CEO<br>Hack Club</div>
          <div class="certificate-number">Cert. #${certificateNumber}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * The issued certificate template. This intentionally matches
   * frontend/static/example-certificate.html, which is the approved design.
   */
  generateCertificateHtml(certificate: Certificate): string {
    const name = this.escapeHtml(certificate.recipientName);
    const award = this.escapeHtml(certificate.awardItem);
    const number = this.escapeHtml(certificate.certificateNumber);
    const pipes = certificate.approvedHours;

    // Keep issued certificates visually identical to the approved example.
    const templatePath = [
      resolve(process.cwd(), 'example-certificate.html'),
      resolve(process.cwd(), '..', 'example-certificate.html'),
      resolve(__dirname, '..', '..', '..', 'example-certificate.html'),
    ].find(existsSync);

    if (templatePath) {
      return readFileSync(templatePath, 'utf8')
        .replaceAll('Ketan Gupta', name)
        .replaceAll('48 approved hours', `${pipes} approved hours`)
        .replaceAll('Bambu Lab A1 Mini 3D Printer', award)
        .replaceAll('BEEST-YSWS-2024-001', number);
    }

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><title>Beest Certificate — ${name}</title>
<style>
@font-face{font-family:'Stone Breaker';src:url('/fonts/Stone%20Breaker.woff2') format('woff2');font-weight:700 900;font-style:normal;font-display:swap}
*{margin:0;padding:0;box-sizing:border-box}:root{--red:#ef3340;--red-dark:#d61f31;--ink:#111114;--paper:#fcfbf8}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:linear-gradient(135deg,#f7efe6 0%,#fcfbf8 55%,#f2ede6 100%);color:var(--ink);font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
.certificate{position:relative;width:min(1050px,100%);aspect-ratio:1.414/1;overflow:hidden;border-radius:18px;background:linear-gradient(180deg,#fff 0%,var(--paper) 100%);box-shadow:0 28px 60px rgba(0,0,0,.22);border:1px solid rgba(17,17,20,.08)}
.brand{top:26px;left:30px;line-height:.95;z-index:1;position:absolute}.flag{width:124px;display:block}.beest{display:block;font-size:44px;font-weight:900;color:var(--ink);text-transform:lowercase}
.main{position:relative;z-index:1;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:78px 40px 72px}.eyebrow{color:rgba(17,17,20,.56);letter-spacing:.32em;font-size:11px;text-transform:uppercase}.title{margin-top:6px;font-family:'Stone Breaker',Impact,'Arial Narrow',Arial,sans-serif;font-size:clamp(54px,7.2vw,80px);line-height:.92;color:var(--ink);text-transform:uppercase}.recipient{margin-top:10px;font-family:'Brush Script MT',cursive;font-size:clamp(50px,7.4vw,82px);color:var(--red)}.body-copy{max-width:760px;margin-top:12px;font-size:clamp(15px,1.65vw,19px);color:rgba(17,17,20,.9);font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
.footer-signatures{display:flex;justify-content:center;gap:82px;margin-top:24px}.signature-line{width:150px;height:34px;margin:0 auto 4px;border-bottom:1px solid rgba(239,51,64,.55)}.certificate-no{position:absolute;left:28px;bottom:72px;padding:8px 10px;border-radius:14px;border:1px dashed rgba(239,51,64,.45);background:rgba(255,255,255,.86)}
@media print{body{padding:0;background:#fff}.certificate{width:100vw;max-width:none;border-radius:0;box-shadow:none}}
</style></head><body><div class="certificate"><div class="brand"><img class="flag" src="https://camo.githubusercontent.com/952e19cabf08f8b6b181def3e9c7476d3b50ee6668f0af1e93931d8f4082ce0f/68747470733a2f2f6173736574732e6861636b636f6d2f666c61672d7374616e64616c6f6e652e737667" alt="Hack Club flag"><span class="beest">beest</span></div><div class="main"><div class="eyebrow">Hack Club Recognition</div><div class="title">Certificate</div><div class="intro">This certificate is proudly presented to</div><div class="recipient">${name}</div><div class="body-copy">This certificate recognizes <strong>${name}</strong>'s fulfilled Beest by Hack Club shop order. <strong>${name}</strong> is hereby awarded <strong>${award}</strong>, purchased for <strong>${pipes} Pipes</strong>.</div><div class="footer-signatures"><div class="signature"><div class="signature-line"></div><div class="signature-name">Euan Ripper</div><div class="signature-role"><strong>Euan Ripper</strong><br>Organizer<br>YSWS</div></div><div class="signature"><div class="signature-line"></div><div class="signature-name">Zach Latta</div><div class="signature-role"><strong>Zach Latta</strong><br>CEO<br>Hack Club</div></div></div></div><div class="certificate-no"><div class="label">Certificate No.</div><div class="number">${number}</div></div></div></body></html>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  }

  /**
   * Get a certificate by ID
   */
  async getCertificateById(id: string): Promise<Certificate> {
    const certificate = await this.certificateRepo.findOne({ where: { id } });
    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }
    return certificate;
  }

  /**
   * Get all certificates for a user
   */
  async getCertificatesForUser(userId: string): Promise<Certificate[]> {
    await this.syncCertificatesForUser(userId);

    return this.certificateRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a certificate by order ID
   */
  async getCertificateByOrderId(orderId: string): Promise<Certificate | null> {
    return this.certificateRepo.findOne({ where: { orderId } });
  }

  /**
   * Get a certificate by its unique certificate number.
   */
  async getCertificateByNumber(
    certificateNumber: string,
  ): Promise<Certificate | null> {
    return this.certificateRepo.findOne({ where: { certificateNumber } });
  }
}
