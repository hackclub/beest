import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { SidekickAuthGuard } from './sidekick-auth.guard';
import { SidekickExceptionFilter } from './sidekick-exception.filter';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';

describe('SidekickAuthGuard', () => {
  const ctxWith = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authorization === undefined ? {} : { authorization },
        }),
      }),
    }) as unknown as ExecutionContext;

  const guard = (expected?: string) =>
    new SidekickAuthGuard({ get: () => expected } as never);

  it('allows the request when the Bearer secret matches', () => {
    expect(guard('s3cret').canActivate(ctxWith('Bearer s3cret'))).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(() => guard('s3cret').canActivate(ctxWith('Bearer nope'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing Authorization header', () => {
    expect(() => guard('s3cret').canActivate(ctxWith())).toThrow(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme', () => {
    expect(() => guard('s3cret').canActivate(ctxWith('Basic s3cret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when SIDEKICK_SECRET is unset', () => {
    expect(() => guard(undefined).canActivate(ctxWith('Bearer anything'))).toThrow(
      UnauthorizedException,
    );
  });

  it('responds with the protocol error body', () => {
    try {
      guard('s3cret').canActivate(ctxWith('Bearer nope'));
      fail('expected UnauthorizedException');
    } catch (err) {
      expect((err as UnauthorizedException).getResponse()).toMatchObject({
        error: 'UNAUTHORIZED',
      });
    }
  });
});

describe('SidekickExceptionFilter', () => {
  const run = (exception: unknown) => {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new SidekickExceptionFilter().catch(exception, host);
    return res;
  };

  it('maps default-shaped Nest exceptions to protocol codes', () => {
    const res = run(new BadRequestException('hours look wrong'));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'VALIDATION_ERROR', message: 'hours look wrong' });
  });

  it('maps 404s to NOT_FOUND', () => {
    const res = run(new NotFoundException('Project not found'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND', message: 'Project not found' });
  });

  it('passes pre-shaped protocol bodies through unchanged', () => {
    const res = run(
      new HttpException({ error: 'ADDRESS_UNAVAILABLE', message: 'vault down' }, 503),
    );
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'ADDRESS_UNAVAILABLE', message: 'vault down' });
  });

  it('turns unknown errors into a 500 INTERNAL_ERROR', () => {
    const res = run(new Error('boom'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR', message: 'Internal server error.' });
  });
});
