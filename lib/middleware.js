const request = require('request');
const config = require('config');
const url = config.get('api.url');
const validSources = config.has('proxies') ? config.get('proxies') : [];

module.exports = (logger) => {
  const validateSource = (req, res, next) => {
    if (0 === validSources.length) return next();
    if (validSources.includes(req.source_address)) return next();

    logger.info(`rejecting INVITE from ${req.source_address}`);
    res.send(603, {headers: {
      'X-Reason': `detected potential spammer from ${req.source_address}:${req.source_port}`
    }});
  };

  const validateDID = (req, res, next) => {
    req.locals = req.locals || {};
    request.post(url, {
      json: true,
      body: {
        dnis: req.calledNumber,
        cpn: req.callingNumber
      }
    }, (err, response, body) => {
      if (err) {
        logger.error(err, 'Error authenticating call');
        res.send(500);
      }
      Object.assign(req.locals, body);
      logger.info(`call to ${req.calledNumber} will use ${JSON.stringify(req.locals)}`);
      next();
    });
  };

  return {
    validateSource,
    validateDID
  };
};

