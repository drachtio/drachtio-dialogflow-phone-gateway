const Srf = require('drachtio-srf');
const srf = new Srf();
const logger = require('pino')({level: 'debug'});
const opts = require('./lib/config')(logger);
require('./lib/utils/connect-ms')(logger, srf, opts.freeswitch);
const CallSession = require('./lib/call-session');
const {initLogging} = require('./lib/middleware')(logger);
const eventStore = require('./lib/event-store')(logger);
const Spreadsheet = require('./lib/google_sheet');
const gsheet = new Spreadsheet(logger);


/* connect to the drachtio server */
srf.connect(opts.drachtio)
  .on('connect', async(err, hp) => logger.info(`connected to sip on ${hp}`))
  .on('error', (err) => logger.info(err, 'Error connecting'));

srf.use('invite', [initLogging]);

/* handle invites */
let callsInProgress = 0;
srf.invite((req, res) => {
  const callSession = new CallSession({req, res, opts});
  callSession
    .on('init', (obj) => {
      callsInProgress++;
      eventStore.add(callSession.uuid, obj);
    })
    .on('intent', (intent) => eventStore.addIntent(callSession.uuid, intent))
    .on('transcription', (transcript) => eventStore.addTranscript(callSession.uuid, transcript))
    .on('end_of_utterance', (evt) => logger.debug(evt, 'received end_of_utterance'))
    .on('audio', (evt) => {})
    .on('error', (err) => logger.info(err, 'received error'))
    .on('end', () => {
      callsInProgress--;
      eventStore.end(callSession.uuid);
    });
  callSession.exec();
});


// websocket: optional for feeding real-time updates to other apps
if (opts.ws.port) require('./lib/http')({logger, eventStore, opts: opts.ws});

/**
 * Every 20 seconds, check to see if we should launch a new call.
 * Launch a new call if there are no calls on the system and the sheet has enabled outbound calling
 */
let callAttempts = 0;
setInterval(async() => {
  if (0 === callsInProgress && gsheet.authenticated) {
    const enabled = await gsheet.isCallingEnabled();
    if (enabled /*&& callAttempts++ < 1*/) {
      const ms = srf.locals.ms;
      logger.info('checking for customers to call');
      const customers = await gsheet.readSheet();
      const selected = customers.find((c) => c.status === 'not called');
      if (selected) {
        logger.info({selected}, 'calling');
        try {
          await gsheet.updateStatus(selected, 'dialing');
          const ep = await ms.createEndpoint();
          const dlg = await srf.createUAC(`sip:${selected.telNumber}@${process.env.SIP_TRUNK_GATEWAY}`, {
            localSdp: ep.local.sdp,
            callingNumber: process.env.SIP_OUTDIAL_CLI
          });
          ep.modify(dlg.remote.sdp);
          dlg.logger = logger;
          logger.info('call answered');
          await gsheet.updateStatus(selected, 'in-progress');

          const callSession = new CallSession({dlg, ep, opts, selected});
          callSession
            .on('init', (obj) => {
              callsInProgress++;
              eventStore.add(callSession.uuid, obj);
            })
            .on('intent', (intent) => eventStore.addIntent(callSession.uuid, intent))
            .on('transcription', (transcript) => eventStore.addTranscript(callSession.uuid, transcript))
            .on('end_of_utterance', (evt) => logger.debug(evt, 'received end_of_utterance'))
            .on('audio', (evt) => {})
            .on('error', (err) => logger.info(err, 'received error'))
            .on('end', () => {
              callsInProgress--;
              gsheet.updateStatus(selected, 'call completed');
              eventStore.end(callSession.uuid);
            });
          callSession.exec();
          /*
          dlg.on('destroy', () => {
            logger.info('call ended');
            callsInProgress--;
            ep.destroy();
            gsheet.updateStatus(selected, 'call completed');=
          });
          */
        } catch (err) {
          callsInProgress--;
          gsheet.updateStatus(selected, 'call completed');
          logger.info({selected, err}, `Outdial failure: ${err.status}`);
        }
      }
    }
  }
}, 10000);

