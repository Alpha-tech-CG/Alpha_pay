import { SetMetadata } from '@nestjs/common';
import { MemberAction } from '../permissions/permissions';

export const TEAM_ACTION_KEY = 'required_team_action';

/**
 * Déclare l'action `permissions.ts` requise sur une route team (ex.
 * `@RequireAction('team:invite')`). Vérifiée par RequireActionGuard via
 * `can(req.membership.role, action)`. Doit suivre RequireMemberGuard.
 */
export const RequireAction = (action: MemberAction) => SetMetadata(TEAM_ACTION_KEY, action);
