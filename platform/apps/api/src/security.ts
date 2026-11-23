import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  CanActivate, Controller, Delete, ExecutionContext, ForbiddenException, Get,
  HttpCode, Injectable, Req, Res, ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Environment, SessionBootstrap } from '@ocasio/contracts';

declare module 'express-session' {
  interface SessionData { csrfToken?: string }
}

export function sessionCookieName(config: Environment) {
  return config.NODE_ENV === 'production' ? '__Host-ocasio.sid' : 'ocasio.sid';
}

export function sessionCookieOptions(config: Environment) {
  return {httpOnly:true,secure:config.NODE_ENV === 'production',sameSite:'lax' as const,path:'/'};
}

/** Protect every routed unsafe browser command; no generic skip decorator exists. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly trustedOrigin: string) {}

  canActivate(context: ExecutionContext): boolean {
    return this.check(context.switchToHttp().getRequest<Request>());
  }

  check(request:Request):boolean {
    if (['GET','HEAD','OPTIONS'].includes(request.method)) return true;
    const supplied = request.headers['x-csrf-token'];
    const expected = request.session?.csrfToken;
    if (
      request.headers.origin !== this.trustedOrigin ||
      request.headers['sec-fetch-site'] === 'cross-site' ||
      typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
      typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) ||
      !timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(expected,'hex'))
    ) throw new ForbiddenException('Request verification failed');
    return true;
  }
}

@Controller('security/session')
export class SessionController {
  @Get()
  async bootstrap(@Req() request: Request): Promise<SessionBootstrap> {
    const identity = await request.app.locals.ocasioAuth.getSession(request.headers);
    request.session.csrfToken ??= randomBytes(32).toString('hex');
    await new Promise<void>((resolve,reject) => request.session.save((error) => error ? reject(new ServiceUnavailableException()) : resolve()));
    return {authenticated:Boolean(identity),csrfToken:request.session.csrfToken};
  }

  @Delete()
  @HttpCode(204)
  async destroy(@Req() request: Request, @Res({passthrough:true}) response: Response) {
    const logout = await request.app.locals.ocasioAuth.signOut(request.headers);
    const cookies = logout.headers.getSetCookie();
    for(const cookie of cookies) response.append('Set-Cookie',cookie);
    await new Promise<void>((resolve,reject) => request.session.destroy((error) => error ? reject(new ServiceUnavailableException()) : resolve()));
    // Use the same host/path/secure attributes as creation, without a new expiry.
    const secure = request.app.locals.ocasioProduction === true;
    response.clearCookie(secure ? '__Host-ocasio.sid' : 'ocasio.sid',{httpOnly:true,secure,sameSite:'lax',path:'/'});
  }
}
