const Srf = require('drachtio-srf');
const srf = new Srf();
const logger = require('pino')({level: 'info'});
const opts = require('./lib/config')(logger);
const CallSession = require('./lib/call-session');
const {initLogging} = require('./lib/middleware')(logger);
const eventStore = require('./lib/event-store')(logger);

require('./lib/utils/connect-ms')(logger, srf, opts.freeswitch);

/* connect to the drachtio server */
srf.connect(opts.drachtio)
  .on('connect', async(err, hp) => logger.info(`connected to sip on ${hp}`))
  .on('error', (err) => logger.info(err, 'Error connecting'));

/**
 * install middleware:
 * 1.  If an APIBAN key was provided, block traffic from banned sources
 * 2.  Initialize logger and then connect the incoming call to the freeswitch media server
 */
const middleware = [initLogging];
if (process.env.APIBAN_KEY) middleware.unshift(require('drachtio-mw-apiban')(process.env.APIBAN_KEY));

srf.use('invite', middleware);

/* handle invites */
srf.invite((req, res) => {
  const callSession = new CallSession(req, res, opts);
  callSession
    .on('init', (obj) => eventStore.add(callSession.uuid, obj))
    .on('intent', (intent) => eventStore.addIntent(callSession.uuid, intent))
    .on('transcription', (transcript) => eventStore.addTranscript(callSession.uuid, transcript))
    .on('end_of_utterance', (evt) => logger.debug(evt, 'received end_of_utterance'))
    .on('audio', (evt) => {})
    .on('error', (err) => logger.info(err, 'received error'))
    .on('end', () => eventStore.end(callSession.uuid));
  callSession.exec();
});


// websocket: optional for feeding real-time updates to other apps
if (opts.ws.port) require('./lib/http')({logger, eventStore, opts: opts.ws});
