const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const config = require('config');
const logger = require('pino')(config.get('logging'));
const CallSession = require('./lib/call-session');

/* connect to the drachtio server */
srf.connect(config.get('drachtio'))
  .on('connect', (err, hp) => logger.info(`connected to sip on ${hp}`))
  .on('error', (err) => logger.info(err, 'Error connecting'));

/* we want to handle incoming invites */
srf.invite((req, res) => {
  const callSession = new CallSession(logger, mrf, req, res);
  callSession
    .on('intent', (intent) => logger.debug(intent, 'received intent'))
    .on('transcription', (transcript) => logger.debug(transcript, 'received transcription'))
    .on('end_of_utterance', (evt) => logger.debug(evt, 'received end_of_utterance'))
    .on('audio', (evt) => logger.info(`received audio file ${evt.path}`))
    .on('error', (err) => logger.info(err, 'received error'))
    .on('end', () => logger.debug('dialogflow session ended'));
  callSession.exec();
});
