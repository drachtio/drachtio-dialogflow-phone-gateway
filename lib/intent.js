
const {v4} = require('uuid');

class Intent {
  constructor(logger, callUUID, req, evt) {
    this.logger = logger;
    this.callUUID = callUUID;
    this.uuid = v4();
    this.evt = evt;

    this.dtmfRequest = checkIntentForDtmfEntry(logger, evt);
    this.callTransferRequest = checkIntentForCallTransfer(logger, req, evt);
    //this.logger.info({evt}, 'intent');
  }

  get isEmpty() {
    return this.evt.response_id.length === 0;
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
      uuid: this.uuid,
      'call-uuid': this.callUUID,
      time: this.time,
      name: this.name
    };
  }

}

module.exports = Intent;


const checkIntentForCallTransfer = (logger, req, intent) => {
  if (!intent.query_result || !intent.query_result.fulfillment_messages) return;

  const telFulfillments = intent.query_result.fulfillment_messages
    .filter((f) => f.platform === 'TELEPHONY');

  // check for custom payloads with a dial verb
  const custom = telFulfillments.find((f) => f.payload && f.payload.verb === 'dial');
  if (custom) {
    if (!custom.payload.callerId) custom.payload.callerId = req.callingNumber;
    return custom.payload;
  }

  // now check for native call transfer
  const native = telFulfillments.find((f) =>
    f.telephony_transfer_call && f.telephony_transfer_call.phone_number);
  if (native) {
    return {
      verb: 'dial',
      callerId: req.callingNumber,
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
  if (!intent.query_result || !intent.query_result.output_contexts) return;
  const context = intent.query_result.output_contexts.find((oc) => oc.name.includes('/contexts/allow-dtmf-'));
  if (!context) return;
  const arr = /allow-dtmf-(\d+)(?:-(\d+))?(?:-(.*))?/.exec(context.name);
  if (arr) {
    return {
      min: parseInt(arr[1]),
      max: arr.length > 2 ? parseInt(arr[2]) : null,
      term: arr.length > 3 ? arr[3] : null
    };
  }
};
