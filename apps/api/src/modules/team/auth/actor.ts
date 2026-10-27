import { TeamActor } from '../services/members.service';

/** Construit l'acteur RBAC depuis la requête : req.appUser (SessionGuard) + req.membership (RequireMemberGuard). */
export function actorFromRequest(req: any): TeamActor {
  return { userId: req.appUser.id, role: req.membership.role };
}
