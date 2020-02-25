const Srf = require('drachtio-srf');
const srf = new Srf();
const logger = require('pino')({level: 'info'});
const opts = require('./lib/config')(logger);
const CallSession = require('./lib/call-session');
const {initLogging} = require('./lib/middleware')(logger);
require('./lib/connect-ms')(logger, srf, opts.freeswitch);

/* connect to the drachtio server */
srf.connect(opts.drachtio)
  .on('connect', async(err, hp) => logger.info(`connected to sip on ${hp}`))
  .on('error', (err) => logger.info(err, 'Error connecting'));

const blacklistUnknownDIDs = (req, res, next) => {
  if (req.calledNumber !== '+15082139758') {
    logger.info(`blacklisting ${req.source_address}`);
    return res.send(403, {
      headers: {
        'X-Reason': `detected potential spammer from ${req.source_address}:${req.source_port}`
      }
    });
  }
  next();
};

/**
 * install middleware:
 * 1.  If an APIBAN key was provided, block traffic from banned sources
 * 2.  Initialize logger and then connect the incoming call to the freeswitch media server
 */
const middleware = [blacklistUnknownDIDs, initLogging];
if (process.env.APIBAN_KEY) middleware.unshift(require('drachtio-mw-apiban')(process.env.APIBAN_KEY));

srf.use('invite', middleware);

/* handle invites */
srf.invite((req, res) => {
  const callSession = new CallSession(req, res, opts);
  callSession
    .on('intent', (intent) => logger.info(intent, 'received intent'))
    .on('transcription', (transcript) => logger.info(transcript, 'received transcription'))
    .on('end_of_utterance', (evt) => logger.debug(evt, 'received end_of_utterance'))
    .on('audio', (evt) => logger.debug(`received audio file ${evt.path}`))
    .on('error', (err) => logger.info(err, 'received error'))
    .on('end', () => logger.debug('dialogflow session ended'));
  callSession.exec();
});
