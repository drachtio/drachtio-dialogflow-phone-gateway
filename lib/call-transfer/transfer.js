const Emitter = require('events');
const placeOutdial = require('./place-outdial');

class CallTransfer extends Emitter {
  constructor(logger, dlg, sipTrunk, opts) {
    super();

    this.logger = logger;
    this.dlgA = dlg;
    this.callerId = opts.callerId;
    this.sipTrunk = sipTrunk;
    this.target = Array.isArray(opts.target) ? opts.target : [opts.target];
    this.dials = [];
    this.hasChosen = false;

    dlg.on('destroy', this._kill.bind(this));
  }

  execB2BUA() {
    let fails = 0;

    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this.dials = this.target.map((t) =>
        placeOutdial(this.logger, this.dlgA, this.callerId, t.length === 1, this.sipTrunk, t));

      this.logger.info({opts: this.opts, target: this.target},
        `executing call transfer with ${this.dials.length} targets`);

      this.dials.forEach((d) => {
        d
          .on('error', (err) => {
            if (++fails === this.dials.length) {
              this.logger.info('all attempted outdials failed');
              reject(err);
            }
          })
          .on('early-media', (sdp) => this._choose(d, sdp))
          .on('connect', (dlg) => this._choose(d, null, dlg));
      });
    });
  }

  _kill() {
    this.logger.info(`caller hung up during outdial, killing ${this.dials.length} outbound calls`);
    for (const d of this.dials) {
      d.kill();
    }
  }

  async _choose(dial, sdp, dlg) {
    if (this.chosen && dial !== this.chosen) return;
    this.chosen = dial;
    this._killAllBut(dial);
    if (sdp) {
      this.remoteSdp = sdp;
      await this.dlgA.modify(sdp).catch((err) => this.logger.info(err, 'Error connecting caller'));
    }
    else {
      this.dlgB = dlg;
      if (this.dlgB.remote.sdp !== this.remoteSdp) {
        this.dlgA.modify(this.dlgB.remote.sdp).catch((err) => this.logger.info(err, 'Error connecting caller'));
      }
      this._setHandlers();
      this.logger.info({'O-CID': this.chosen.dialog.sip.callId}, 'successfully connected call transfer');
      this._resolve(this.chosen.dialog);
    }
  }

  _killAllBut(dial, resolve) {
    for (const d of this.dials) {
      if (d !== dial) d.kill();
    }
    this.dials = [];
  }

  _setHandlers() {
    this.dlgA.other = this.dlgB;
    this.dlgB.other = this.dlgA;
    [this.dlgA, this.dlgB].forEach((d) => {
      d.on('destroy', () => {
        this.logger.info('transferred call ended');
        d.other.destroy().catch((err) => {});
        this.emit('end');
      });
    });
  }
}

module.exports = CallTransfer;
