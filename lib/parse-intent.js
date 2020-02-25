const Intent = require('./intent');

/**
 * Check if a call transfer was requested, either through using
 * a native telephony_transfer_call or a custom payload.
 * If found, return an object describing where to transfer the call
 * @param {object} intent
 */
function checkIntentForCallTransfer(intent) {
  if (!intent.query_result || !intent.query_result.fulfillment_messages) return;

  const telFulfillments = intent.query_result.fulfillment_messages
    .filter((f) => f.platform === 'TELEPHONY');

  // check for custom payloads with a dial verb
  const custom = telFulfillments.find((f) => f.payload && f.payload.verb === 'dial');
  if (custom) return custom.payload;

  // now check for native call transfer
  const native = telFulfillments.find((f) =>
    f.telephony_transfer_call && f.telephony_transfer_call.phone_number);
  if (native) {
    return {
      verb: 'dial',
      target: [{
        type : 'phone',
        number: native.telephony_transfer_call.phone_number
      }]
    };
  }
}

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
function checkIntentForDtmfEntry(intent) {
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
}

module.exports = (evt) => {
  return Object.assign({},
    checkIntentForCallTransfer(evt),
    checkIntentForDtmfEntry(evt));
};
