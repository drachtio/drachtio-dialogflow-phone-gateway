class Intent {
  constructor(logger, callingNumber, evt) {
    this.logger = logger;
    this.evt = evt;

    this.dtmfRequest = checkIntentForDtmfEntry(logger, evt);
    this.callTransferRequest = checkIntentForCallTransfer(logger, callingNumber, evt);
    this.logger.debug({evt}, 'intent');
  }

  get isEmpty() {
    return this.evt.response_id.length === 0;
  }

  get fulfillmentText() {
    return this.evt.query_result.fulfillment_text;
  }

  get saysCallTransfer() {
    return !!this.callTransferRequest;
  }

  get saysEndInteraction() {
    return this.evt.query_result.intent.end_interaction || this.saysCallTransfer;
  }

  get saysCollectDtmf() {
    return !!this.dtmfRequest;
  }

  get callTransferInstructions() {
    return this.callTransferRequest;
  }

  get dtmfInstructions() {
    return this.dtmfRequest;
  }

  get name() {
    if (!this.isEmpty) return this.evt.query_result.intent.display_name;
  }

  toJSON() {
    return {
      name: this.name,
      fulfillmentText: this.fulfillmentText
    };
  }

}

module.exports = Intent;


const checkIntentForCallTransfer = (logger, callingNumber, intent) => {
  const qr = intent.query_result;
  if (!qr || !qr.fulfillment_messages) return;

  // check for custom payloads with a dial verb
  let custom = qr.fulfillment_messages.find((f) => f.payload && f.payload.verb === 'dial');
  if (custom) {
    if (!custom.payload.callerId) custom.payload.callerId = callingNumber;
    return custom.payload;
  }

  custom = qr.fulfillment_messages.find((f) => f.payload && f.payload.command === 'transfer' && f.payload.phone_number);
  if (custom) {
    return {
      verb: 'dial',
      callerId: callingNumber,
      target: [{
        type : 'phone',
        number: custom.payload.phone_number
      }]
    };
  }


  // now check for native call transfer
  const telFulfillments = intent.query_result.fulfillment_messages
    .filter((f) => f.platform === 'TELEPHONY');

  const native = telFulfillments.find((f) =>
    f.telephony_transfer_call && f.telephony_transfer_call.phone_number);
  if (native) {
    return {
      verb: 'dial',
      callerId: callingNumber,
      target: [{
        type : 'phone',
        number: native.telephony_transfer_call.phone_number
      }]
    };
  }
};

/**
 * Parse a returned intent for DTMF entry information
 * i.e.
 * allow-dtmf-x-y-z
 * x = min number of digits
 * y = optional, max number of digits
 * z = optional, terminating character
 * e.g.
 * allow-dtmf-5 :     collect 5 digits
 * allow-dtmf-1-4 :   collect between 1 to 4 (inclusive) digits
 * allow-dtmf-1-4-# : collect 1-4 digits, terminating if '#' is entered
 * @param {*} intent - dialogflow intent
 */
const checkIntentForDtmfEntry = (logger, intent) => {
  const qr = intent.query_result;
  logger.info('checkIntentForDtmfEntry');
  if (!qr || !qr.fulfillment_messages || !qr.output_contexts) {
    logger.info({f: qr.fulfillment_messages, o: qr.output_contexts}, 'no dtmfs');
    return;
  }

  // check for custom payloads with a gather verb
  const custom = qr.fulfillment_messages.find((f) => f.payload && f.payload.verb === 'gather');
  if (custom && custom.payload && custom.payload.verb === 'gather') {
    logger.info({custom}, 'found dtmf custom payload');
    return {
      max: custom.payload.numDigits,
      term: custom.payload.finishOnKey,
      template: custom.payload.responseTemplate
    };
  }

  // check for an output context with a specific naming convention
  const context = qr.output_contexts.find((oc) => oc.name.includes('/contexts/allow-dtmf-'));
  if (context) {
    const arr = /allow-dtmf-(\d+)(?:-(\d+))?(?:-(.*))?/.exec(context.name);
    if (arr) {
      logger.info({custom}, 'found dtmf output context');
      return {
        min: parseInt(arr[1]),
        max: arr.length > 2 ? parseInt(arr[2]) : null,
        term: arr.length > 3 ? arr[3] : null
      };
    }
  }

  // does the fulfillment text include "say or enter" and we are slot-filling
  /*
  logger.info({qr}, 'checking for dtmf');
  if (qr.all_required_params_present === false &&
    qr.fulfillment_text &&
    qr.fulfillment_text.toLowerCase().includes('say or enter')) {
    logger.info('found dtmf implied by slot-filling prompt');
    return {
      term: '#'
    };
  }
  */
};
