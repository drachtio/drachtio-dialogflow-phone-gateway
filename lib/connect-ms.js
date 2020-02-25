const Mrf = require('drachtio-fsmrf');

module.exports = async(logger, srf, opts) => {
  const mrf = new Mrf(srf);
  try {
    const ms = await mrf.connect(opts);
    setHandlers(logger, ms);
    srf.locals.ms = ms;
  } catch (err) {
    // retry every 10 secs until we connect
    logger.info({opts}, 'failed connecting to freeswitch, will retry..');
    const timer = setInterval(async() => {
      try {
        const ms = await mrf.connect(opts);
        clearInterval(timer);
        setHandlers(logger, ms);
        srf.locals.ms = ms;
      } catch (err) {
        logger.info({opts}, 'failed connecting to freeswitch, will retry..');
      }
    });
  }
};

const setHandlers = (logger, ms) => {
  ms.active = 1;
  ms.conn
    .on('esl::end', () => {
      ms.active = false;
      logger.info(`lost connection to freeswitch at ${ms.address}`);
    })
    .on('esl::ready', () => {
      ms.active = true;
      logger.info(`connected to freeswitch at ${ms.address}`);
    });
};
