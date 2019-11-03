const Emitter = require('events');
const config = require('config');
const fillSound = config.has('typing-sound') ? config.get('typing-sound') : '';
const dfOpts = config.get('dialogflow');
const welcomeEvent = config.has('dialogflow.events.welcome') ? config.get('dialogflow.events.welcome') : '';

function checkIntentForCallTransfer(intent) {
  if (!intent.query_result || !intent.query_result.fulfillment_messages) return;
  const telephonyPlatform = intent.query_result.fulfillment_messages.find((f) => {
    return f.platform === 'TELEPHONY' &&
      f.telephony_transfer_call &&
      f.telephony_transfer_call.phone_number;
  });
  if (telephonyPlatform) {
    return telephonyPlatform.telephony_transfer_call.phone_number;
  }
}

class CallSession extends Emitter {
  constructor(logger, mrf, req, res) {
    super();

    this.logger = logger;
    this.req = req;
    this.res = res;
    this.mrf = mrf;
    this.locale = config.get('dialogflow.project');
    this.projectId = config.get('dialogflow.lang');
    this.hotword = config.has('dialogflow.hotword') ?
      config.get('dialogflow.hotword') : '';
  }

  async exec() {
    try {
      const ms = await this.mrf.connect(config.get('freeswitch'));
      const {endpoint, dialog} = await ms.connectCaller(this.req, this.res);
      dialog.on('destroy', () => {
        this.logger.info('call ended');
        endpoint.destroy().catch((err) => this.logger.info(err, 'Error deleting endpoint'));
      });
      this.logger.info(`call connected, starting dialogflow agent ${dfOpts.project} using lang ${dfOpts.lang}`);

      endpoint.addCustomEventListener('dialogflow::intent', this._onIntent.bind(this, endpoint, dialog));
      endpoint.addCustomEventListener('dialogflow::transcription', this._onTranscription.bind(this, endpoint));
      endpoint.addCustomEventListener('dialogflow::audio_provided', this._onAudioProvided.bind(this, endpoint, dialog));
      endpoint.addCustomEventListener('dialogflow::end_of_utterance', this._onEndOfUtterance.bind(this));
      endpoint.addCustomEventListener('dialogflow::error', this._onError.bind(this));

      // start dialogflow agent
      endpoint.api('dialogflow_start', `${endpoint.uuid} ${dfOpts.project} ${dfOpts.lang} 30 ${welcomeEvent}`);

    } catch (err) {
      this.logger.error(err, 'Error connecting call');
      return;
    }
  }


  _onIntent(ep, dlg, evt) {
    this.emit('intent', evt);

    if (evt.response_id.length === 0) {
      this.logger.info('no intent was detected, reprompting..');
      ep.api('dialogflow_start', `${ep.uuid} ${dfOpts.project} ${dfOpts.lang} 30 actions_intent_NO_INPUT`);
      return;
    }

    const transferTo = checkIntentForCallTransfer(evt);
    if (transferTo) {
      this.logger.info(`transfering call to ${transferTo} after prompt completes`);
      this.transferTo = transferTo;
    }

    //  if 'end_interaction' is true, end the dialog after playing the final prompt
    //  (or in 1 second if there is no final prompt)
    if (evt.query_result.intent.end_interaction || transferTo) {
      this.hangupAfterPlayDone = !transferTo;
      this.waitingForPlayStart = true;
      setTimeout(() => {if (this.waitingForPlayStart) dlg.destroy();}, 1000);
    }
  }

  _onTranscription(ep, evt) {
    this.emit('transcription', evt);

    // if a final transcription, start a typing sound
    if (fillSound.length > 0 && evt.recognition_result && evt.recognition_result.is_final === true &&
      evt.recognition_result.confidence > 0.8) {
      ep.play(fillSound).catch((err) => this.logger.info(err, 'Error playing typing sound'));
    }

    if (dfOpts.hotword && evt.recognition_result &&
      evt.recognition_result.transcript && this.playInProgress &&
      evt.recognition_result.transcript.toLowerCase().includes(dfOpts.hotword.toLowerCase())) {

      this.logger.info(`spotted hotword ${dfOpts.hotword}, killing audio`);
      this.playInProgress = false;
      ep.api('uuid_break', ep.uuid).catch((err) => this.logger.info(err, 'Error killing audio'));
    }
  }

  _onEndOfUtterance(evt) {
    this.emit('end_of_utterance', evt);
  }

  _onError(evt) {
    this.emit('error', evt);
    this.logger.error(`got error: ${JSON.stringify(evt)}`);
  }

  async _onAudioProvided(ep, dlg, evt) {
    this.emit('audio', evt);
    this.waitingForPlayStart = false;

    // kill filler audio and start playing new audio file
    await ep.api('uuid_break', ep.uuid);

    // start a new intent, unless we are transferring or ending the session
    if (!this.hangupAfterPlayDone && !this.transferTo) {
      ep.api('dialogflow_start', `${ep.uuid} ${dfOpts.project} ${dfOpts.lang} 30`);
    }

    this.playInProgress = true;
    await ep.play(evt.path);
    this.playInProgress = false;
    if (this.hangupAfterPlayDone) {
      this.logger.info('hanging up since intent was marked end interaction');
      dlg.destroy().catch((err) => {this.logger.info(err, 'error hanging up call');});
      this.emit('end');
    }
    else if (this.transferTo) {
      const doRefer = config.has('callTransfer.method') && config.get('callTransfer.method') === 'REFER';
      this.logger.info(`transfering call to ${this.transferTo} using ${doRefer ? 'REFER' : 'INVITE'}`);
      if (doRefer) {
        const domain = config.has('callTransfer.domain') ? config.get('callTransfer.domain') : this.req.source_address;
        dlg.request({
          method: 'REFER',
          headers: {
            'Refer-To': `<sip:${this.transferTo}@${domain}>`,
            'Referred-By': `<sip:${this.req.callingNumber}@${domain}>`,
            'Contact': '<sip:localhost>'
          }
        });
        dlg.on('notify', (req, res) => {
          res.send(200);
          this.logger.info(`received NOTIFY with ${req.body}`);
          if (req.get('Subscription-State').match(/terminated/)) {
            this.logger.info('hanging up after transfer completes');
            dlg.destroy();
            ep.destroy();
            this.emit('end');
          }
        });
      }
      else {
        const srf = dlg.srf;
        try {
          const dlgB = await srf.createUAC(
            `sip:${this.transferTo}@${this.req.source_address}`,
            {
              localSdp: dlg.remote.sdp,
              callingNumber: this.req.callingNumber
            }
          );
          dlg.removeAllListeners('destroy');
          ep.destroy();
          dlg.other = dlgB;
          dlgB.other = dlg;
          [dlg, dlgB].forEach((d) => {
            d.on('destroy', () => {this.emit('end'); d.other.destroy();});
          });
        }
        catch (err) {
          this.logger.info(err, `Call transfer outdial failed with ${err.status}`);
        }
      }
    }
  }
}

module.exports = CallSession;
