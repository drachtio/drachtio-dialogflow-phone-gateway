const bent = require('bent');

const api = (logger) => {

  const lookupDID = async(telNumber) => {
    const arr = /00(\d+)/.exec(telNumber);
    const did = arr ? arr[1] : telNumber;
    const url = `${process.env.NUMBER_LOOKUP_BASE_URL}${did}?account_sid=${process.env.NUMBER_LOOKUP_ACCOUNT_SID}&auth_token=${process.env.NUMBER_LOOKUP_AUTH_TOKEN}&name,address,location,cnam,carrier,carrier_o,gender,linetype,image,line_provider,profile`;
    logger.info({url}, 'number lookup url');
    const get = bent(url, 'json');
    return await get();
  };

  return {
    lookupDID
  };
};

module.exports = api;
