import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MobileMoneyFactory } from './mobile-money/mobile-money.factory';
import { MtnConnectorStub } from './mobile-money/mtn/mtn.connector';
import { MtnConnectorReal } from './mobile-money/mtn/mtn.connector.real';
import { AirtelConnectorStub } from './mobile-money/airtel/airtel.connector';
import { AirtelConnectorReal } from './mobile-money/airtel/airtel.connector.real';

import { CardIssuerFactory, Union54ConnectorStub, Union54ConnectorReal, UnlimintConnectorStub, UnlimintConnectorReal } from './card-issuer/card-issuer.connector';
import { KycFactory, SmileConnectorStub, SmileConnectorReal, SumsubConnectorStub, SumsubConnectorReal } from './kyc/kyc.connector';
import { LibyanBankFactory, WahdaConnectorStub, BcdConnectorStub } from './libyan-bank/libyan-bank.connector';

import { FX_CONNECTOR } from './fx/fx.interface';
import { FxConnectorStub } from './fx/fx.connector';
import { FxConnectorReal } from './fx/fx.connector.real';
import { CIRCLE_CONNECTOR, CircleConnectorStub, CircleConnectorReal } from './circle/circle.connector';
import { WISE_CONNECTOR, WiseConnectorStub, WiseConnectorReal } from './wise/wise.connector';
import { USSD_CONNECTOR, UssdConnectorStub, UssdConnectorReal } from './ussd/ussd.connector';
import { NOTIFICATION_CONNECTOR, NotificationConnectorStub, NotificationConnectorReal } from './notifications/notification.connector';

/** Builds a token provider that returns the stub or real impl based on a config flag. */
function stubOrReal<S, R>(token: string, flagPath: string, Stub: new (...a: never[]) => S, Real: new (...a: never[]) => R): Provider {
  return {
    provide: token,
    inject: [ConfigService, Stub, Real],
    useFactory: (config: ConfigService, stub: S, real: R) => (config.get<boolean>(flagPath) ? stub : real),
  };
}

const concreteConnectors = [
  MtnConnectorStub, MtnConnectorReal, AirtelConnectorStub, AirtelConnectorReal,
  Union54ConnectorStub, Union54ConnectorReal, UnlimintConnectorStub, UnlimintConnectorReal,
  SmileConnectorStub, SmileConnectorReal, SumsubConnectorStub, SumsubConnectorReal,
  WahdaConnectorStub, BcdConnectorStub,
  FxConnectorStub, FxConnectorReal, CircleConnectorStub, CircleConnectorReal,
  WiseConnectorStub, WiseConnectorReal, UssdConnectorStub, UssdConnectorReal,
  NotificationConnectorStub, NotificationConnectorReal,
];

const factories = [MobileMoneyFactory, CardIssuerFactory, KycFactory, LibyanBankFactory];

const tokenProviders: Provider[] = [
  stubOrReal(FX_CONNECTOR, 'connectors.fxUseStub', FxConnectorStub, FxConnectorReal),
  stubOrReal(CIRCLE_CONNECTOR, 'connectors.circleUseStub', CircleConnectorStub, CircleConnectorReal),
  stubOrReal(WISE_CONNECTOR, 'connectors.wiseUseStub', WiseConnectorStub, WiseConnectorReal),
  stubOrReal(USSD_CONNECTOR, 'connectors.atUseStub', UssdConnectorStub, UssdConnectorReal),
  stubOrReal(NOTIFICATION_CONNECTOR, 'connectors.notifyUseStub', NotificationConnectorStub, NotificationConnectorReal),
];

/** Global so any feature module can inject a connector/factory without re-importing. */
@Global()
@Module({
  providers: [...concreteConnectors, ...factories, ...tokenProviders],
  exports: [...factories, ...tokenProviders],
})
export class ConnectorsModule {}
