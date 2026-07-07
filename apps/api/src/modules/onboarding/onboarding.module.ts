import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { PublicOnboardingController } from './public-onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [OnboardingController, PublicOnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
