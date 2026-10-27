import { actorFromRequest } from './actor';

describe('actorFromRequest', () => {
  it('construit { userId, role } depuis req.appUser + req.membership', () => {
    const req = { appUser: { id: 'u1', sessionId: 's1' }, membership: { merchantId: 'm1', role: 'ADMIN' } };
    expect(actorFromRequest(req)).toEqual({ userId: 'u1', role: 'ADMIN' });
  });
});
