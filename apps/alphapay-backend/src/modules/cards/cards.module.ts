import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VirtualCard } from './entities/virtual-card.entity';
import { CardNetwork, CardStatus } from '../../common/types/enums';
import { CardIssuerFactory } from '../../connectors/card-issuer/card-issuer.connector';
import { UsersService } from '../users/users.service';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Market } from '../../common/types/market.enum';

@Injectable()
class CardsService {
  constructor(
    @InjectRepository(VirtualCard) private readonly repo: Repository<VirtualCard>,
    private readonly factory: CardIssuerFactory,
    private readonly users: UsersService,
  ) {}

  async issue(userId: string) {
    const user = await this.users.findById(userId);
    const issued = await this.factory.getConnector(user.market as Market).issueCard({ userId, currency: 'USD' });
    return this.repo.save(
      this.repo.create({
        userId,
        issuerCardId: issued.issuerCardId,
        network: issued.network as CardNetwork,
        lastFour: issued.lastFour,
        expiryMonth: issued.expiryMonth,
        expiryYear: issued.expiryYear,
        issuedForMarket: user.market,
      }),
    );
  }

  list(userId: string) {
    return this.repo.find({ where: { userId } });
  }

  private async own(userId: string, cardId: string): Promise<VirtualCard> {
    const card = await this.repo.findOne({ where: { id: cardId } });
    if (!card) throw new NotFoundException('Card not found');
    if (card.userId !== userId) throw new ForbiddenException('Not your card');
    return card;
  }

  async topUp(userId: string, cardId: string, amountUsd: number) {
    const card = await this.own(userId, cardId);
    const user = await this.users.findById(userId);
    await this.factory.getConnector(user.market as Market).topUp(card.issuerCardId, amountUsd);
    card.balanceUsd = String(+card.balanceUsd + amountUsd);
    return this.repo.save(card);
  }

  /** PAN is never stored — fetched live from the issuer each reveal. */
  async reveal(userId: string, cardId: string) {
    const card = await this.own(userId, cardId);
    const user = await this.users.findById(userId);
    return this.factory.getConnector(user.market as Market).revealPan(card.issuerCardId);
  }

  async freeze(userId: string, cardId: string) {
    const card = await this.own(userId, cardId);
    card.status = card.status === CardStatus.FROZEN ? CardStatus.ACTIVE : CardStatus.FROZEN;
    return this.repo.save(card);
  }
}

@Controller('cards')
@UseGuards(JwtAuthGuard)
class CardsController {
  constructor(private readonly cards: CardsService) {}
  @Post() issue(@CurrentUser('sub') u: string) { return this.cards.issue(u); }
  @Get() list(@CurrentUser('sub') u: string) { return this.cards.list(u); }
  @Post(':id/topup') topup(@CurrentUser('sub') u: string, @Param('id') id: string, @Body() b: { amountUsd: number }) {
    return this.cards.topUp(u, id, b.amountUsd);
  }
  @Post(':id/reveal') reveal(@CurrentUser('sub') u: string, @Param('id') id: string) { return this.cards.reveal(u, id); }
  @Post(':id/freeze') freeze(@CurrentUser('sub') u: string, @Param('id') id: string) { return this.cards.freeze(u, id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([VirtualCard]), UsersModule],
  providers: [CardsService],
  controllers: [CardsController],
  exports: [CardsService],
})
export class CardsModule {}
