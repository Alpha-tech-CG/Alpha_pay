import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({ path: '/' })
export class WebhooksGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: WebSocket) {
    client.send(JSON.stringify({ event: 'connected', data: { service: 'PayBrain' }, ts: Date.now() }));
  }

  broadcast(event: string, data: unknown) {
    const msg = JSON.stringify({ event, data, ts: Date.now() });
    this.server?.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }
}
