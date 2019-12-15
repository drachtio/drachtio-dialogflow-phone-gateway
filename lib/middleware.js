const request = require('request');
const config = require('config');
const url = config.get('api.url');

function validateDID(logger) {
  return (req, res, next) => {
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
}

module.exports = {
  validateDID
};
