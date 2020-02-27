const express = require('express');
const app = express();
require('express-ws')(app);

const sendEvent = (ws, evt) => {
  ws.send(JSON.stringify(evt));
};

function subscribe(logger, eventStore, ws, uuid) {
  const eventSession = eventStore.queryCall(uuid);
  if (eventSession) {
    eventSession.on('event', sendEvent.bind(eventSession, ws));

    // send historical events
    for (const evt of eventSession.eventList) {
      sendEvent.bind(eventSession)(ws, evt);
    }
  }
}

function unsubscribe(logger, eventStore, ws, uuid) {
  const eventSession = eventStore.queryCall(uuid);
  if (eventSession) {
    eventSession.removeListener(sendEvent.bind(null, ws));
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
      logger.info(`close from ${req.connection.remoteAddress}, ${count} listeners`);

    });

    ws.on('message', (msg) => {
      if (typeof msg === 'string') {
        try {
          const obj = JSON.parse(msg);
          switch (obj.type) {
            case 'subscribe':
              subscribe(logger, eventStore, ws, obj.uuid || obj.data.uuid);
              break;
            case 'unsubscribe':
              unsubscribe(logger, eventStore, ws, obj.uuid || obj.data.uuid);
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

  app.listen(opts.port, () => {
    logger.info(`websocket server listening on ${opts.port}`);
  });

  setInterval(eventStore.purge.bind(eventStore), 60000);
};


