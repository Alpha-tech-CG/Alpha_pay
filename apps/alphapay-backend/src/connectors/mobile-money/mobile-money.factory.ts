import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Operator } from '../../common/types/operator.enum';
import { MobileMoneyConnector } from './mobile-money.interface';
import { MtnConnectorStub } from './mtn/mtn.connector';
import { MtnConnectorReal } from './mtn/mtn.connector.real';
import { AirtelConnectorStub } from './airtel/airtel.connector';
import { AirtelConnectorReal } from './airtel/airtel.connector.real';

/** Resolves the correct mobile-money connector (stub vs real) per operator + env flag. */
@Injectable()
export class MobileMoneyFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly mtnStub: MtnConnectorStub,
    private readonly mtnReal: MtnConnectorReal,
    private readonly airtelStub: AirtelConnectorStub,
    private readonly airtelReal: AirtelConnectorReal,
  ) {}

  getConnector(operator: Operator): MobileMoneyConnector {
    switch (operator) {
      case Operator.MTN:
        return this.config.get<boolean>('connectors.mtnUseStub') ? this.mtnStub : this.mtnReal;
      case Operator.AIRTEL:
        return this.config.get<boolean>('connectors.airtelUseStub') ? this.airtelStub : this.airtelReal;
      default:
        throw new Error(`No mobile-money connector for operator: ${operator}`);
    }
  }
}
