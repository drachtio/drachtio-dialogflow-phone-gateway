const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const config = require('config');
const logger = require('pino')(config.get('logging'));
const {validateSource, validateDID} = require('./lib/middleware')(logger);
const CallSession = require('./lib/call-session');

/* connect to the drachtio server */
srf.connect(config.get('drachtio'))
  .on('connect', (err, hp) => {
    logger.info(`connected to sip on ${hp}`);
    startProxyPings();
  })
  .on('error', (err) => logger.info(err, 'Error connecting'));

/* we want to handle incoming invites */
srf.use('invite', [validateSource, validateDID]);
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

/* OPTIONS ping the proxies to let them know we are here */

const startProxyPings = async() => {
  if (config.has('proxies')) {
    const proxies = config.get('proxies');
    if (proxies.length > 0) {
      await pingProxies(proxies);
      setInterval(pingProxies.bind(null, proxies), 20000);
    }
  }
};

const pingProxies = async(proxies) => {
  for (const proxy of proxies) {
    const uri = `sip:${proxy}`;
    try {
      const req = await srf.request({
        uri,
        method: 'OPTIONS',
        headers: {
          'X-Status': 'open',
          'X-Calls': 0
        }
      });
      req.on('response', (res) => {
        logger.debug(`received ${res.status} to OPTIONS`);
      });
    } catch (err) {
      logger.info({err}, `Error sending OPTIONS ping to ${proxy}`);
    }
  }
};
