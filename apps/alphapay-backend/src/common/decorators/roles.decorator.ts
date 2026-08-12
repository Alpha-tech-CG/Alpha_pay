import { SetMetadata } from '@nestjs/common';
import { AccountType } from '../types/account-type.enum';

export const ROLES_KEY = 'roles';
/** Restrict a route to the given account types (enforced by RolesGuard). */
export const Roles = (...roles: AccountType[]) => SetMetadata(ROLES_KEY, roles);
