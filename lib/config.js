const config = require('config');
const assert = require('assert');

module.exports = (logger) => {
  const getDrachtioConfig = () => {
    const d = config.has('drachtio') ? config.get('drachtio') : {};
    return {
      host: process.env.DRACHTIO_HOST || d.host || '127.0.0.1',
      port: process.env.DRACHTIO_PORT || d.port || 9022,
      secret: process.env.DRACHTIO_SECRET || d.secret || 'cymru'
    };
  };

  const getFreeswitchConfig = () => {
    const f = config.has('freeswitch') ? config.get('freeswitch') : {};
    return {
      address: process.env.FREESWITCH_ADDRESS || f.address || '127.0.0.1',
      port: process.env.FREESWITCH_PORT || f.port || 8021,
      secret: process.env.FREESWITCH_SECRET || f.secret || 'ClueCon'
    };
  };

  const getDialogFlowConfig = () => {
    const d = config.has('dialogflow') ? config.get('dialogflow') : {};
    const project = process.env.DIALOGFLOW_PROJECT || d.project;
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS || d.credentials;
    const lang = process.env.DIALOGFLOW_LANG || d.lang || 'en-us';
    const inboundWelcomeEvent = process.env.DIALOGFLOW_INBOUND_WELCOME_EVENT || d.welcomeEvent || '';
    const outboundWelcomeEvent = process.env.DIALOGFLOW_OUTBOUND_WELCOME_EVENT || '';
    const noInputTimeout = process.env.DIALOGFLOW_NO_INPUT_TIMEOUT || d.noInputTimeout || 0;
    const enableDtmfAlways = parseInt(process.env.DIALOGFLOW_ENABLE_DTMF_ALWAYS) === 1 || d.enableDtmfAlways === true;
    const interDigitTimeout = parseInt(process.env.DIALOGFLOW_INTERDIGIT_TIMEOUT || d.interDigitTimeout || 3000);
    const bargePhrase = process.env.DIALOGFLOW_BARGE_PHRASE || d.bargePhrase;
    const thinkingSound = process.env.DIALOGFLOW_THINKING_SOUND || d.thinkingSound || 0;
    assert.ok(project, 'dialogflow project requires DIALOGFLOW_PROJECT env var or config file');
    assert.ok(credentials,
      'dialogflow credentials requires either via GOOGLE_APPLICATION_CREDENTIALS env var in config file');

    return {
      project,
      lang,
      credentials,
      inboundWelcomeEvent,
      outboundWelcomeEvent,
      noInputTimeout,
      enableDtmfAlways,
      interDigitTimeout,
      bargePhrase,
      thinkingSound
    };
  };

  const getSipTrunkConfig = () => {
    const t = config.has('sipTrunk') ? config.get('sipTrunk') : {};
    const gateway = process.env.SIP_TRUNK_GATEWAY || t.gateway;
    if (!gateway) {
      logger.info('no sip trunk gateway specified in SIP_TRUNK_GATEWAY env or config, call transfer disabled');
      return {};
    }
    const method = process.env.CALL_TRANSFER_METHOD || t.method || 'INVITE';
    const username = process.env.SIP_TRUNK_USERNAME || t.username;
    const password = process.env.SIP_TRUNK_PASSWORD || t.password;

    const opts = {
      gateway,
      method
    };
    if (username && password) Object.assign(opts, {username, password});
    return opts ;
  };

  const getWsConfig = () => {
    const ws = config.has('websocket') ? config.get('websocket') : {};
    const port = process.env.HTTP_PORT || ws.httpPort;
    const username = process.env.HTTP_USERNAME || ws.username;
    const password = process.env.HTTP_PASSWORD || ws.password;

    const opts = {
      port,
      username,
      password
    };
    return opts;
  };

  return {
    drachtio: getDrachtioConfig(),
    freeswitch: getFreeswitchConfig(),
    dialogflow: getDialogFlowConfig(),
    sipTrunk: getSipTrunkConfig(),
    ws: getWsConfig()
  };
};
