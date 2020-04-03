const bent = require('bent');

const toBase64 = (str) => Buffer.from(str || '', 'utf8').toString('base64');

function basicAuth() {
  const creds = `${process.env.SIMWOOD_API_USERNAME}:${process.env.SIMWOOD_API_PASSWORD}`;
  const header = `Basic ${toBase64(creds)}`;
  return {Authorization: header};
}

const v3api = (logger) => {

  const getTime = async() => {
    const url = `${process.env.SIMWOOD_API_BASE_URL_V3}tools/time`;
    const get = bent(url, 'json', basicAuth());
    logger.info(`getTime: ${url}`);
    return await get();
  };

  const sendSms = async(opts) => {
    const url = `${process.env.SIMWOOD_API_BASE_URL_V3}messaging/${process.env.SIMWOOD_ACCOUNT}/sms`;
    logger.info(`sendSMS: ${url}`);
    const post = bent(url, 'json', basicAuth());
    return await post(opts);

  }

  return {
    getTime,
    sendSms
  };
};

module.exports = v3api;
