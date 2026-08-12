import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Market } from '../../common/types/market.enum';
import { EncryptionService } from '../../common/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly encryption: EncryptionService,
  ) {}

  findByPhone(phoneNumber: string): Promise<User | null> {
    return this.repo.findOne({ where: { phoneNumber } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createIfAbsent(phoneNumber: string, market: Market): Promise<User> {
    const existing = await this.findByPhone(phoneNumber);
    if (existing) return existing;
    return this.repo.save(this.repo.create({ phoneNumber, market }));
  }

  async touchLogin(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }

  /** Promote a user's KYC level (called when a submission is approved). */
  async setKyc(id: string, level: number): Promise<void> {
    await this.repo.update(id, { kycLevel: level, kycVerified: level >= 1 });
  }

  /** Returns a safe view (decrypted name if present, never raw national ID). */
  toProfile(user: User) {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      market: user.market,
      accountType: user.accountType,
      kycVerified: user.kycVerified,
      kycLevel: user.kycLevel,
      fullName: user.encryptedFullName ? this.encryption.decrypt(user.encryptedFullName) : null,
    };
  }
}
