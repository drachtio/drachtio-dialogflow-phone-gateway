const Emitter = require('events');
const SipError = require('drachtio-srf').SipError;
const assert = require('assert');

/**
 * @classdesc places a single outdial
 */
class SingleDialer extends Emitter {
  constructor(logger, dlg, callerId, connectOnEarlyMedia, sipTrunk, target) {
    super();
    assert(target.type);

    this.logger = logger;
    this.target = target;
    this.connectOnEarlyMedia = connectOnEarlyMedia;

    this.opts = {
      localSdp: dlg.remote.sdp,
      proxy: `sip:${sipTrunk.gateway}`
    };
    this.dlgA = dlg;

    if (sipTrunk.username) {
      Object.assign(this.opts, {
        auth: {
          username: sipTrunk.username,
          password: sipTrunk.password
        }
      });
    }
    switch (this.target.type) {
      case 'phone':
        assert(this.target.number);
        this.uri = `sip:${this.target.number}@${sipTrunk.gateway}`;
        break;
      case 'sip':
        assert(this.target.sipUri);
        this.uri = this.target.sipUri;
        break;
      default:
        // should have been caught by parser
        assert(false, `invalid dial type ${this.target.type}: must be phone, user, or sip`);
    }
    Object.assign(this.opts, {
      callingNumber: callerId,
      headers: {
        To: this.uri
      }
    });

    this.logger.info({target: this.target}, 'target');
  }

  get dialog() {
    return this.dlgB;
  }

  async exec() {
    const srf = this.dlgA.srf;
    try {
      this.dlgB = await srf.createUAC(this.uri, this.opts, {
        cbRequest: (err, req) => {
          if (err) {
            this.logger.error(err, 'SingleDialer:exec Error creating call');
            this.emit('error', err);
            return;
          }
          this.logger.info({'O-CID': req.get('Call-ID')}, 'SingleDialer:exec launched invite');
          this.inviteInProgress = req;
        },
        cbProvisional: (prov) => {
          if (this.connectOnEarlyMedia && [180, 183].includes(prov.status) && prov.body) {
            this.emit('early-media', prov.body);
          }
        }
      });
      this.inviteInProgress = null;
      this.emit('connect', this.dlgB);
      return this.dlgB;
    } catch (err) {
      this.inviteInProgress = null;
      if (err instanceof SipError) this.logger.info(`SingleDialer:exec outdial failure ${err.status}`);
      else this.logger.error(err, 'SingleDialer:exec');
      this.emit('error', err);
    }
  }

  kill() {
    if (this.inviteInProgress) {
      this.logger.info({'O-CID': this.inviteInProgress.get('Call-ID')}, 'SingleDialer:kill - canceling call');
      this.inviteInProgress.cancel();
    }
    else if (this.dlgB && this.dlgB.connected) {
      this.logger.info({'O-CID': this.dlgB.sip.callId}, 'SingleDialer:kill - hanging up call');
      this.dlgB.destroy().catch((err) => {});
    }
  }
}

function placeOutdial(logger, dlg, callerId, connectOnEarlyMedia, sipTrunk, target) {
  const sd = new SingleDialer(logger, dlg, callerId, connectOnEarlyMedia, sipTrunk, target);
  sd.exec();
  return sd;
}

module.exports = placeOutdial;

