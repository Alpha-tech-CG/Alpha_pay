import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string;
  phone: string;
  market: string;
  accountType: string;
}

/** Injects the JWT-authenticated user (or one of its fields) into a handler param. */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | string => {
    const req = ctx.switchToHttp().getRequest();
    const user: JwtUser = req.user;
    return data ? user?.[data] : user;
  },
);
