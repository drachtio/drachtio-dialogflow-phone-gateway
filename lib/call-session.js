const Emitter = require('events');
const {v4} = require('uuid');
const DigitBuffer = require('./utils/digit-buffer');
const Intent = require('./models/intent');
const Transcription = require('./models/transcription');
const CallTransfer = require('./call-transfer/transfer');
const SipError = require('drachtio-srf').SipError;
const fs = require('fs');
let serviceAccountJson;

const connectCallToMs = async(req, res) => {
  const srf = req.srf;
  const ms = srf.locals.ms;
  const logger = req.locals.logger;

  if (!ms || !ms.active) {
    logger.info(`rejecting incoming call from ${req.callingNumber}: freeswitch is down`);
    return res.send(480);
  }
  try {
    const {endpoint, dialog} = await ms.connectCaller(req, res);
    Object.assign(req.locals, {ep: endpoint, dlg: dialog});
  } catch (err) {
    logger.error(err, 'Error connecting call to media server');
  }
};

/**
 * Class representing a call that is connected to dialogflow
 * @class
 */
class CallSession extends Emitter {
  constructor({req, res, dlg, ep, opts, selected}) {
    super();

    this.opts = opts.dialogflow;
    this.sipTrunk = opts.sipTrunk;

    if (dlg) {
      this.inbound = false;
      this._dlg = dlg;
      this._ep = ep;
      this.logger = dlg.logger;
      this.customer = selected;
      this.greetingPlayed = false;
    }
    else {
      this.inbound = true;
      this.logger = req.locals.logger;
      this.req = req;
      this.res = res;
    }
    this.uuid = v4();

    const {sendSms} = require('./simwood_v3')(this.logger);
    const {lookupDID} = require('./num-lookup-api')(this.logger);
    this.sendSms = sendSms;
    this.lookupDID = lookupDID;

    this.logger.info(opts);
  }

  get ms() {
    return this.req.srf.locals.ms;
  }

  get ep() {
    return this._ep || this.req.locals.ep;
  }

  get dlg() {
    return this._dlg || this.req.locals.dlg;
  }

  async exec() {
    try {

      const eventParams = this.eventParams = {};
      const eventName = this.eventName = this.inbound ? process.env.DIALOGFLOW_INBOUND_WELCOME_EVENT : process.env.DIALOGFLOW_OUTBOUND_WELCOME_EVENT;
      try {
        /*
        const response = await this.sendSms({
          to: '15083084809',
          from: '15085710838',
          message: 'hi there we got your call!'
        });
        this.logger.info({response}, 'successfully sent SMS');
        */
        if (this.inbound) {
          const numberDetails = await this.lookupDID(this.req.callingNumber);
          Object.assign(eventParams, {
            calling_number: this.req.callingNumber,
            customer_name: `${numberDetails.data.expanded_name.first} ${numberDetails.data.expanded_name.last}`    
          });
          this.logger.info({numberDetails}, 'successfully retrieved number details');
        }
        else {
          Object.assign(eventParams, {
            called_number: this.customer.telNumber,
            customer_name: this.customer.name
          });
        }
      } catch (err) {
        this.logger.error(err);
      }

      if (this.inbound) await connectCallToMs(this.req, this.res);
      this.dlg.on('destroy', () => {
        this.ep.destroy().catch((err) => this.logger.info(err, 'Error deleting endpoint'));
        this.logger.info('call ended');
        this.emit('end');
      });

      this.on('end', () => {if (this.ep && this.ep.connected) this.ep.destroy();});

      this.emit('init', {
        callingNumber: this.inbound ? this.req.callingNumber : 'outbound',
        calledNumber: this.inbound ? this.req.calledNumber : this.customer.telNumber,
        agent: this.opts.project
      });

      this.logger.info(`starting dialogflow agent ${this.opts.project} using lang ${this.opts.lang}`);

      // add dialogflow event listeners
      this.ep.addCustomEventListener('dialogflow::intent', this._onIntent.bind(this, this.ep, this.dlg));
      this.ep.addCustomEventListener('dialogflow::transcription', this._onTranscription.bind(this, this.ep));
      this.ep.addCustomEventListener('dialogflow::audio_provided', this._onAudioProvided.bind(this, this.ep, this.dlg));
      this.ep.addCustomEventListener('dialogflow::end_of_utterance', this._onEndOfUtterance.bind(this));
      this.ep.addCustomEventListener('dialogflow::error', this._onError.bind(this));
      this.ep.on('dtmf', this._onDtmf.bind(this, this.ep));

      // set the application credentials
      if (!serviceAccountJson) {
        serviceAccountJson = JSON.stringify(JSON.parse(fs.readFileSync(this.opts.credentials)));
      }
      await this.ep.set('GOOGLE_APPLICATION_CREDENTIALS', serviceAccountJson);

      // start dialogflow agent on the call
      this.ep.api('dialogflow_start', `${this.ep.uuid} ${this.opts.project} ${this.opts.lang} ${eventName} '${JSON.stringify(eventParams)}'`);

    } catch (err) {
      this.logger.error(err, 'Error starting dialogflow');
      this.dlg.destroy();
      this.emit('end');
      return;
    }
  }

  /**
   * An intent has been returned.  Since we are using SINGLE_UTTERANCE on the dialogflow side,
   * we may get an empty intent, signified by the lack of a 'response_id' attribute.
   * In such a case, we just start another StreamingIntentDetectionRequest.
   * @param {*} ep -  media server endpoint
   * @param {*} dlg - sip dialog
   * @param {*} evt - event data
   */
  _onIntent(ep, dlg, evt) {
    const intent = new Intent(this.logger, this.inbound ? this.req.callingNumber : process.env.SIP_OUTDIAL_CLI, evt);

    this.emit('intent', intent.toJSON());

    if (intent.isEmpty) {
      /**
       * An empty intent is returned in 3 conditions:
       * 1. Our no-input timer fired
       * 2. We collected dtmf that needs to be fed to dialogflow
       * 3. A normal dialogflow timeout
       */
      if (this.noinput && (this.inbound || this.greetingPlayed)) {
        this.logger.info('no input timer fired, reprompting..');
        this.noinput = false;
        ep.api('dialogflow_start', `${ep.uuid} ${this.opts.project} ${this.opts.lang} actions_intent_NO_INPUT`);
      }
      else if (this.dtmfEntry && (this.inbound || this.greetingPlayed)) {
        this.logger.info('dtmf detected, reprompting..');
        ep.api('dialogflow_start', `${ep.uuid} ${this.opts.project} ${this.opts.lang} none \'${this.dtmfEntry}\'`);
        this.dtmfEntry = null;
      }
      else if (this.inbound || this.greetingPlayed) {
        this.logger.info('starting another intent');
        ep.api('dialogflow_start', `${ep.uuid} ${this.opts.project} ${this.opts.lang}`);
      }
      return;
    }

    // clear the no-input timer and the digit buffer
    this._clearNoinputTimer();
    if (this.digitBuffer) this.digitBuffer.flush();

    /* check whether an action was requested: call transfer? */
    if (intent.saysCallTransfer) {
      if (!this.sipTrunk.gateway) {
        this.logger.info('call transfer was requested, but no sip trunk has been configured');
      }
      else {
        this.callTransfer = new CallTransfer(this.logger, dlg, this.sipTrunk, intent.callTransferInstructions);
        // we can't start it yet because we may need to play a file first
      }
    }

    /* hang up (or tranfer call) after playing next audio file? */
    if (intent.saysEndInteraction) {
      //  if 'end_interaction' is true, end the dialog after playing the final prompt
      //  (or in 1 second if there is no final prompt)
      this.hangupAfterPlayDone = !intent.saysCallTransfer;
      this.waitingForPlayStart = true;
      setTimeout(() => {
        if (this.waitingForPlayStart) dlg.destroy();
      }, 1000);
    }

    /* collect digits? */
    else if (intent.saysCollectDtmf || this.opts.enableDtmfAlways) {
      const opts = Object.assign({
        idt: this.opts.interDigitTimeout
      }, intent.dtmfInstructions || {term: '#'});
      this.digitBuffer = new DigitBuffer(this.logger, opts);
      this.digitBuffer.once('fulfilled', this._onDtmfEntryComplete.bind(this, ep));
    }
  }

  /**
   * A transcription - either interim or final - has been returned.
   * If we are doing barge-in based on hotword detection, check for the hotword or phrase.
   * If we are playing a filler sound, like typing, during the fullfillment phase, start that
   * if this is a final transcript.
   * @param {*} ep  -  media server endpoint
   * @param {*} evt - event data
   */
  _onTranscription(ep, evt) {
    const transcription = new Transcription(this.logger, evt);
    this.emit('transcription', transcription.toJSON());

    // if a final transcription, start a typing sound
    if (this.opts.thinkingSound.length > 0 && !transcription.isEmpty && transcription.isFinal &&
      transcription.confidence > 0.8) {
      ep.play(this.opts.thinkingSound).catch((err) => this.logger.info(err, 'Error playing typing sound'));
    }

    if (this.opts.bargePhrase && !transcription.isEmpty && this.playInProgress &&
      transcription.startsWith(this.opts.bargePhrase)) {

      this.logger.info(`spotted hotword ${this.opts.bargePhrase}, killing audio`);
      this.playInProgress = false;
      ep.api('uuid_break', ep.uuid).catch((err) => this.logger.info(err, 'Error killing audio'));
    }
  }

  /**
   * The caller has just finished speaking.  No action currently taken.
   * @param {*} evt - event data
   */
  _onEndOfUtterance(evt) {
    this.emit('end_of_utterance', evt);
  }

  /**
   * Dialogflow has returned an error of some kind.
   * @param {*} evt - event data
   */
  _onError(evt) {
    this.emit('error', evt);
    this.logger.error(`got error: ${JSON.stringify(evt)}`);
  }

  /**
   * Audio has been received from dialogflow and written to a temporary disk file.
   * Start playing the audio, after killing any filler sound that might be playing.
   * When the audio completes, start the no-input timer.
   * @param {*} ep -  media server endpoint
   * @param {*} dlg - sip dialog
   * @param {*} evt - event data
   */
  async _onAudioProvided(ep, dlg, evt) {
    this.emit('audio', evt);
    this.waitingForPlayStart = false;

    // kill filler audio
    await ep.api('uuid_break', ep.uuid);

    // start a new intent, (we want to continue to listen during the audio playback)
    // _unless_ we are transferring or ending the session
    if ((this.inbound || this.greetingPlayed) && !this.hangupAfterPlayDone && !this.callTransfer) {
      ep.api('dialogflow_start', `${ep.uuid} ${this.opts.project} ${this.opts.lang}`);
    }

    this.playInProgress = true;
    this.curentAudioFile = evt.path;
    this.logger.info(`starting to play ${evt.path}`);
    await ep.play(evt.path);
    this.logger.info(`finished ${evt.path}`);
    if (this.curentAudioFile === evt.path) {
      this.playInProgress = false;
    }
    if (!this.inbound && !this.greetingPlayed) {
      this.logger.info('finished greeting on outbound call, starting new intent');
      this.ep.api('dialogflow_start', `${ep.uuid} ${this.opts.project} ${this.opts.lang}`);
    }
    this.greetingPlayed = true;

    if (this.hangupAfterPlayDone) {
      this.logger.info('hanging up since intent was marked end interaction');
      dlg.destroy().catch((err) => {this.logger.info(err, 'error hanging up call');});
      this.emit('end');
    }
    else if (this.callTransfer) {
      // now can start the call transfer
      try {
        const dlgB = await this.callTransfer.execB2BUA();
        this.logger.info(`call transfer successfully completed to ${dlgB.local.uri}`);
        this.emit('end');
      } catch (err) {
        if (err instanceof SipError) this.logger.info(`Call transfer outdial failed with final status ${err.status}`);
        else this.logger.error({err}, 'Call transfer outdial failed with unexpected error');
        this.dlg.destroy().catch((err) => {});
        this.emit('end');
      }
    }
    else {
      // every time we finish playing a prompt, start the no-input timer
      this._startNoinputTimer(ep, dlg);
    }
  }

  /**
   * receive a dmtf entry from the caller.
   * If we have active dtmf instructions, collect and process accordingly.
   */
  _onDtmf(ep, evt) {
    if (this.digitBuffer) this.digitBuffer.process(evt.dtmf);
  }

  _onDtmfEntryComplete(ep, dtmfEntry) {
    this.logger.info(`collected dtmf entry: ${dtmfEntry}`);
    this.dtmfEntry = dtmfEntry;
    this.digitBuffer = null;
    // if a final transcription, start a typing sound
    if (this.opts.thinkingSound.length > 0) {
      ep.play(this.opts.thinkingSound).catch((err) => this.logger.info(err, 'Error playing typing sound'));
    }

    // kill the current dialogflow, which will result in us getting an immediate intent
    ep.api('dialogflow_stop', `${ep.uuid}`)
      .catch((err) => this.logger.info(`dialogflow_stop failed: ${err.message}`));
  }

  /**
   * The user has not provided any input for some time.
   * Set the 'noinput' member to true and kill the current dialogflow.
   * This will result in us re-prompting with an event indicating no input.
   * @param {*} ep
   * @param {*} dlg
   */
  _onNoInput(ep, dlg) {
    this.noinput = true;

    // kill the current dialogflow, which will result in us getting an immediate intent
    ep.api('dialogflow_stop', `${ep.uuid}`)
      .catch((err) => this.logger.info(`dialogflow_stop failed: ${err.message}`));
  }

  /**
   * Stop the no-input timer, if it is running
   */
  _clearNoinputTimer() {
    if (this.noinputTimer) {
      clearTimeout(this.noinputTimer);
      this.noinputTimer = null;
    }
  }

  /**
   * Start the no-input timer.  The duration is set in the configuration file.
   * @param {*} ep
   * @param {*} dlg
   */
  _startNoinputTimer(ep, dlg) {
    if (!this.opts.noInputTimeout) return;
    this._clearNoinputTimer();
    this.noinputTimer = setTimeout(this._onNoInput.bind(this, ep, dlg), this.opts.noInputTimeout);
  }
}

module.exports = CallSession;
