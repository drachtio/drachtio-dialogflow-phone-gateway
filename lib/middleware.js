module.exports = (logger) => {

  const initLogging = (req, res, next) => {
    req.locals = req.locals || {};
    req.locals.logger = logger.child({callId: req.get('Call-ID'), callingNumber: req.callingNumber});
    next();
  };


  return {
    initLogging
  };
};
