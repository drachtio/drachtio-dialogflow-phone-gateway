const express = require('express');
const app = express();
const cors = require('cors')
require('express-ws')(app);
const connections = new Map();

class SessionHandler {
  constructor(logger, eventStore, ws, uuid) {
    this.logger = logger;
    this.eventStore = eventStore;
    this.ws = ws;
    this.uuid = uuid;

    this.fn = this.sendEvent.bind(this);

    this.subscribe();
  }

  sendEvent(evt) {
    this.ws.send(JSON.stringify(evt));
  }

  subscribe() {
    const eventSession = this.eventStore.queryCall(this.uuid);
    if (eventSession) {
      eventSession.on('event', this.fn);
      const count = eventSession.listenerCount('event');
      this.logger.info(`after adding listener session ${this.uuid} has ${count} listeners`);

      // send historical events
      for (const evt of eventSession.eventList) {
        this.sendEvent(evt);
      }
    }
  }

  unsubscribe() {
    const eventSession = this.eventStore.queryCall(this.uuid);
    if (eventSession) {
      eventSession.removeListener('event', this.fn);
      const count = eventSession.listenerCount('event');
      this.logger.info(`after removing listener session ${this.uuid} has ${count} listeners`);
    }
  }
}


function sendCallList(logger, eventStore, calls) {
  try {
    const msg = JSON.stringify({
      type: 'calls',
      data: calls
    });
    this.send(msg);
  } catch (err) {
    logger.info(`Error sending call list, disconnecting ${err.msg}`);
  }
}

module.exports = ({logger, eventStore, opts}) => {
  // websocket server
  app.ws('/', (ws, req) => {
    logger.info(`received connection from ${req.connection.remoteAddress}`);

    // send initial call list
    const callStatusHandler = sendCallList.bind(ws, logger, eventStore);
    callStatusHandler(eventStore.callList);
    eventStore.on('callStatusChange', callStatusHandler);

    ws.on('close', (code, reason) => {
      eventStore.removeListener('callStatusChange', callStatusHandler);
      const count = eventStore.listenerCount('callStatusChange');
      connections.delete(ws);
      logger.info(`close from ${req.connection.remoteAddress}, ${count} listeners`);
    });

    ws.on('message', (msg) => {
      if (typeof msg === 'string') {
        try {
          const obj = JSON.parse(msg);
          switch (obj.type) {
            case 'subscribe':
              {
                if (!obj.uuid) return;
                logger.info(`got subscribe for call ${obj.uuid}`);
                const handler = connections.get(ws);
                if (handler) handler.unsubscribe();
                connections.set(ws, new SessionHandler(logger, eventStore, ws, obj.uuid));
              }
              break;
            case 'unsubscribe':
              {
                if (!obj.uuid) return;
                logger.info(`got subscribe for call ${obj.uuid}`);
                const handler = connections.get(ws);
                if (handler) {
                  handler.unsubscribe();
                  connections.delete(ws);
                }
              }
              break;
            default:
              logger.info({obj}, 'unknown/unsupported request from websocket client');
          }
        } catch (err) {
          logger.info(`Error parsing ${msg}: ${err}`);
        }
      }
    });
  });

  app.use(cors());
  app.listen(opts.port, () => {
    logger.info(`websocket server listening on ${opts.port}`);
  });

  setInterval(eventStore.purge.bind(eventStore), 60000);
};


