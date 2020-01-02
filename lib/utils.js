const request = require('request');
//require('request-debug')(request);
const fs = require('fs');
const {execSync} = require('child_process');

/**
 * Parse a returned intent for call transfer information
 * @param {*} intent - dialogflow intent
 */
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

function postRecording(logger, recordpath, url, deleteAfterUpload) {
  logger.info(`POST ${url}, from file ${recordpath}, delete after upload? ${deleteAfterUpload}`);
  try {
    const output = execSync(`sudo chmod a+r ${recordpath}`);
    logger.debug(`output: ${output}`);

    const formData = {
      file: fs.createReadStream(recordpath)
    };

    request.post({url, formData}, (err, response) => {
      if (err) logger.error(err, 'Error uploading file');
      else logger.info(`call uploaded successfully: ${recordpath}`);
      if (deleteAfterUpload) {
        setTimeout(() => execSync(`sudo rm ${recordpath}`), 30000);
      }
    });
  } catch (err) {
    logger.info(err, `Error uploading ${recordpath}`);
  }
}

module.exports = {
  checkIntentForCallTransfer,
  checkIntentForDtmfEntry,
  postRecording
};
