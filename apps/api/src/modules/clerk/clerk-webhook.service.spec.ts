import { ClerkWebhookService } from './clerk-webhook.service';
import { NotificationService } from '../notifications/notification.service';
import { UsersService } from '../users/users.service';

type PrismaMock = {
  merchant: { findUnique: jest.Mock; create: jest.Mock };
};

function makeService() {
  const prisma: PrismaMock = {
    merchant: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'm1' }) },
  };
  const notifications = { send: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  const users = {
    upsertFromClerk: jest.fn().mockResolvedValue({ id: 'u1' }),
    markDeletedByClerkUserId: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<UsersService>;

  const service = new ClerkWebhookService(prisma as never, notifications, users);
  return { service, prisma, notifications, users };
}

const CREATED_DATA = {
  id: 'clerk_1',
  first_name: 'Jean',
  last_name: 'Dupont',
  email_addresses: [{ email_address: 'jean@example.com', verification: { status: 'verified' } }],
};

describe('ClerkWebhookService — miroir app_users (Team Members étape A)', () => {
  it('user.created synchronise app_users avant de créer le Merchant', async () => {
    const { service, users, prisma } = makeService();

    await service.handleUserCreated(CREATED_DATA as any);

    expect(users.upsertFromClerk).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      email: 'jean@example.com',
      fullName: 'Jean Dupont',
    });
    expect(prisma.merchant.create).toHaveBeenCalled();
  });

  it('user.created sans email vérifiable ne touche pas app_users', async () => {
    const { service, users } = makeService();

    await service.handleUserCreated({ ...CREATED_DATA, email_addresses: [] } as any);

    expect(users.upsertFromClerk).not.toHaveBeenCalled();
  });

  it('user.updated met à jour app_users (pas le Merchant)', async () => {
    const { service, users, prisma } = makeService();

    await service.handleUserUpdated({
      id: 'clerk_1',
      first_name: 'Jean',
      last_name: 'Martin',
      email_addresses: [{ email_address: 'jean.martin@example.com', verification: { status: 'verified' } }],
    } as any);

    expect(users.upsertFromClerk).toHaveBeenCalledWith({
      clerkUserId: 'clerk_1',
      email: 'jean.martin@example.com',
      fullName: 'Jean Martin',
    });
    expect(prisma.merchant.create).not.toHaveBeenCalled();
  });

  it('user.deleted détache app_users du compte Clerk', async () => {
    const { service, users } = makeService();

    await service.handleUserDeleted({ id: 'clerk_1', deleted: true });

    expect(users.markDeletedByClerkUserId).toHaveBeenCalledWith('clerk_1');
  });
});
