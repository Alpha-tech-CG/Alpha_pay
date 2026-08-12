import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Current user's own profile (ownership enforced by JWT sub). */
  @Get('me')
  async me(@CurrentUser() user: JwtUser) {
    const entity = await this.users.findById(user.sub);
    return this.users.toProfile(entity);
  }
}
