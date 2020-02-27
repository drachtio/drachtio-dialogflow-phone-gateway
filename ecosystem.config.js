module.exports = {
  apps : [{
    name: 'simwood dialogflow gateway',
    script: 'app.js',
    cwd: '/home/admin/drachtio-dialogflow-phone-gateway',
    instances: 1,
    watch: false,
    max_memory_restart: '1G',
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: '/home/admin/gcp.json',
      DIALOGFLOW_PROJECT: 'ai-in-rtc-drachtio-tljjpn',
      APIBAN_KEY: '12c2a03e1ec7c467c07ce30cab621734',
      XX_SIP_TRUNK_GATEWAY: 'simcon.pstn.twilio.com',
      SIP_TRUNK_GATEWAY: 'out.simwood.com',
      DIALOGFLOW_NO_INPUT_TIMEOUT: 15000,
      DIALOGFLOW_BARGE_PHRASE: 'copy that',
      DIALOGFLOW_THINKING_SOUND: '/home/admin/drachtio-dialogflow-phone-gateway/sounds/keyboard-typing.wav',
      HTTP_PORT: 8080
    }
  }]
};
