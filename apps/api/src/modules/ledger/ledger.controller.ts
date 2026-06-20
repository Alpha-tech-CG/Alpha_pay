import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InternalGuard } from '../../common/guards/internal.guard';
import { LedgerService } from './ledger.service';
import { PostEntryDto } from './dto/post-entry.dto';
import { EmptyEntryError, UnbalancedEntryError } from './ledger.errors';

@Controller('internal/ledger')
@UseGuards(InternalGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('verify')
  verify() {
    return this.ledgerService.verifyChain();
  }

  @Get('accounts/:accountId/balance')
  async getBalance(@Param('accountId') accountId: string) {
    const balance = await this.ledgerService.getAccountBalance(accountId);
    return { accountId, balanceCents: balance.toString() };
  }

  @Post()
  async postEntry(@Body() dto: PostEntryDto) {
    try {
      const transactionId = await this.ledgerService.postEntry(dto.lines);
      return { transactionId };
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err instanceof EmptyEntryError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
