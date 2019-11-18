const Srf = require('drachtio-srf');
const srf = new Srf();
const Mrf = require('drachtio-fsmrf');
const mrf = new Mrf(srf);
const config = require('config');
const logger = require('pino')(config.get('logging'));
const CallSession = require('./lib/call-session');
const parseExpires = require('./lib/parse-expires');

/* connect to the drachtio server */
srf.connect(config.get('drachtio'))
  .on('connect', (err, hp) => {
    logger.info(`connected to sip on ${hp}`);
    /* some sip trunking providers require us to register in order to receive calls.. */
    if (config.has('register')  && config.get('register.enabled') === true) {
      const domain = config.has('register.domain');
      const proxy = config.has('register.proxy') ? config.get('register.proxy') : null;
      const auth = config.get('register.auth');
      registerWithProvider(domain, proxy, auth);
    }
  })
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

async function registerWithProvider(domain, proxy, auth) {
  const uri = `<sip:${auth.username}@${domain}>`;
  const contact = `<sip:${auth.username}@localhost>`;
  try {
    const req = await srf.request({
      uri: `sip:${domain}`,
      method: 'REGISTER',
      proxy,
      auth,
      headers: {
        'To': uri,
        'From': uri,
        'Contact': contact,
        'Expires': 3600
      }
    });
    req.on('response', (res) => {
      if (res.status === 200) {
        const duration = parseExpires(res);
        if (duration) {
          logger.info('successfully registered with sip provider');
          setTimeout(registerWithProvider.bind(null, domain, proxy, auth), duration - 10);
        }
        else throw new Error('200 OK to REGISTER did not include expires value');
      }
      else throw new Error(`Failure registering: ${res.status}`);
    });
  } catch (err) {
    logger.info(err, 'Failed registering with sip provider');
  }
}
