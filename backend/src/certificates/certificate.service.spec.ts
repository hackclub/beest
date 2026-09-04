jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      setViewport: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('png')),
    }),
    close: jest.fn(),
  }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CertificateService } from './certificate.service';
import { Certificate } from '../entities/certificate.entity';
import { Order } from '../entities/order.entity';
import { User } from '../entities/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('CertificateService', () => {
  let service: CertificateService;
  let certificateRepo: any;
  let orderRepo: any;
  let userRepo: any;
  let auditLogService: any;

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    name: 'Ketan Gupta',
    nickname: 'Ketan',
  };

  beforeEach(async () => {
    certificateRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ id: 'cert-uuid-1', ...dto })),
      save: jest.fn(async (entity) => entity),
    };

    orderRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    userRepo = {
      findOne: jest.fn(async () => mockUser),
    };

    auditLogService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateService,
        {
          provide: getRepositoryToken(Certificate),
          useValue: certificateRepo,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: orderRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    service = module.get<CertificateService>(CertificateService);
  });

  describe('generateCertificateForOrder', () => {
    it('should generate a certificate for a non-grant shop order over 30 Pipes', async () => {
      const order: Partial<Order> = {
        id: 'order-1',
        userId: 'user-uuid-1',
        itemName: 'Arduino Starter Kit',
        pipesSpent: 31,
        status: 'fulfilled',
        shopItem: { isGrant: false } as any,
        user: mockUser as any,
      };

      orderRepo.findOne.mockResolvedValue(order);
      certificateRepo.findOne.mockResolvedValue(null);

      const cert = await service.generateCertificateForOrder('order-1');

      expect(cert).toBeDefined();
      expect(cert?.recipientName).toBe('Ketan');
      expect(cert?.approvedHours).toBe(31);
      expect(cert?.awardItem).toBe('Arduino Starter Kit');
      expect(cert?.isGrant).toBe(false);
      expect(auditLogService.log).toHaveBeenCalledWith(
        'user-uuid-1',
        'certificate_generated',
        expect.stringContaining('Arduino Starter Kit'),
      );
    });

    it('should not generate a certificate for a non-grant shop order costing 30 Pipes or less', async () => {
      const order: Partial<Order> = {
        id: 'order-30',
        userId: 'user-uuid-1',
        itemName: 'Small Hardware Kit',
        pipesSpent: 30,
        status: 'fulfilled',
        shopItem: { isGrant: false } as any,
        user: mockUser as any,
      };

      orderRepo.findOne.mockResolvedValue(order);

      await expect(service.generateCertificateForOrder('order-30')).resolves.toBeNull();
      expect(certificateRepo.save).not.toHaveBeenCalled();
    });

    it('should skip certificate generation for grant order if cumulative pipes is 30 or less', async () => {
      const order: Partial<Order> = {
        id: 'order-grant-1',
        userId: 'user-uuid-1',
        itemName: 'Hardware Grant',
        pipesSpent: 7,
        status: 'fulfilled',
        shopItem: { isGrant: true } as any,
        user: mockUser as any,
      };

      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.find.mockResolvedValue([order]); // only 7 pipes total

      const cert = await service.generateCertificateForOrder('order-grant-1');

      expect(cert).toBeNull();
      expect(certificateRepo.save).not.toHaveBeenCalled();
    });

    it('should generate a grant certificate when cumulative grant pipes > 30', async () => {
      const order: Partial<Order> = {
        id: 'order-grant-31',
        userId: 'user-uuid-1',
        itemName: 'Hardware Grant',
        pipesSpent: 31,
        status: 'fulfilled',
        shopItem: { isGrant: true } as any,
        user: mockUser as any,
      };

      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.find.mockResolvedValue([order]);
      certificateRepo.findOne.mockResolvedValue(null);

      const cert = await service.generateCertificateForOrder('order-grant-31');

      expect(cert).toBeDefined();
      expect(cert?.approvedHours).toBe(31);
      expect(cert?.grantValue).toBe(155); // 5 * 31
      expect(cert?.isGrant).toBe(true);
      expect(cert?.awardItem).toBe('Hardware Grant');
      expect(cert?.certificateText).toContain('$155 USD');
    });

    it('should aggregate pipes across multiple purchases of the same grant and update certificate (e.g., 25 pipes + 7 pipes = 32 pipes)', async () => {
      const order1: Partial<Order> = {
        id: 'order-10-aug',
        userId: 'user-uuid-1',
        itemName: 'Hardware Grant',
        pipesSpent: 25,
        status: 'fulfilled',
        shopItem: { isGrant: true } as any,
        user: mockUser as any,
      };

      const order2: Partial<Order> = {
        id: 'order-14-aug',
        userId: 'user-uuid-1',
        itemName: 'Hardware Grant',
        pipesSpent: 7,
        status: 'fulfilled',
        shopItem: { isGrant: true } as any,
        user: mockUser as any,
      };

      // Mock finding order2
      orderRepo.findOne.mockResolvedValue(order2);
      // Mock finding all user fulfilled grant orders: 25 + 7 = 32 pipes
      orderRepo.find.mockResolvedValue([order1, order2]);

      // Mock existing certificate created during order1 for 25 pipes
      const existingCert: Partial<Certificate> = {
        id: 'existing-cert-1',
        userId: 'user-uuid-1',
        orderId: 'order-10-aug',
        recipientName: 'Ketan',
        approvedHours: 25,
        grantValue: 125,
        awardItem: 'Hardware Grant',
        isGrant: true,
        certificateNumber: 'CERT-2026-TEST001',
        certificateText: 'Old text',
      };
      certificateRepo.findOne.mockResolvedValue(existingCert);

      const cert = await service.generateCertificateForOrder('order-14-aug');

      expect(cert).toBeDefined();
      expect(cert?.approvedHours).toBe(32); // 25 + 7
      expect(cert?.grantValue).toBe(160); // 5 * 32
      expect(cert?.certificateText).toContain('$160 USD');
      expect(auditLogService.log).toHaveBeenCalledWith(
        'user-uuid-1',
        'certificate_updated',
        expect.stringContaining('32 Pipes ($160)'),
      );
    });

    it('does not rewrite or audit an unchanged grant certificate during sync', async () => {
      const order: Partial<Order> = {
        id: 'order-grant-31',
        userId: 'user-uuid-1',
        itemName: 'Hardware Grant',
        pipesSpent: 31,
        status: 'fulfilled',
        shopItem: { isGrant: true } as any,
        user: mockUser as any,
      };
      const certificateText =
        "This certificate recognizes Ketan's fulfilled Beest by Hack Club shop order. Ketan is hereby awarded Hardware Grant ($155 USD Grant), purchased for 31 Pipes.";
      const existingCert: Partial<Certificate> = {
        id: 'existing-cert-1',
        userId: 'user-uuid-1',
        orderId: 'order-grant-31',
        recipientName: 'Ketan',
        approvedHours: 31,
        grantValue: 155,
        awardItem: 'Hardware Grant',
        isGrant: true,
        certificateNumber: 'CERT-2026-TEST001',
        certificateText,
      };

      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.find.mockResolvedValue([order]);
      certificateRepo.findOne.mockResolvedValue(existingCert);

      const cert = await service.generateCertificateForOrder('order-grant-31');

      expect(cert).toBe(existingCert);
      expect(certificateRepo.save).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });

  describe('generateCertificateHtml', () => {
    it('fills named placeholders from the packaged template', () => {
      const html = service.generateCertificateHtml({
        id: 'cert-uuid-1',
        recipientName: 'Ada Lovelace',
        approvedHours: 42,
        awardItem: 'Soldering Kit',
        certificateNumber: 'CERT-2026-ABC123',
        isGrant: false,
        grantValue: null,
      } as Certificate);

      expect(html).toContain('Ada Lovelace');
      expect(html).toContain('Soldering Kit');
      expect(html).toContain('42hrs');
      expect(html).toContain('CERT-2026-ABC123');
      expect(html).not.toContain('{{NAME}}');
      expect(html).not.toContain('{{AWARD}}');
      expect(html).not.toContain('{{HOURS}}');
      expect(html).not.toContain('{{CERTNO}}');
    });
  });
});
