const {v4} = require('uuid');

class Transcription {
  constructor(logger, callUUID, evt) {
    this.logger = logger;
    this.callUUID = callUUID;

    this.recognition_result = evt.recognition_result;
    this.uuid = v4();
    this.time = new Date().toDateString();
  }

  get isEmpty() {
    return !this.recognition_result;
  }

  get isFinal() {
    return this.recognition_result && this.recognition_result.is_final === true;
  }

  get confidence() {
    if (!this.isEmpty) return this.recognition_result.confidence;
  }

  get text() {
    if (!this.isEmpty) return this.recognition_result.transcript;
  }

  startsWith(str) {
    return (this.text.toLowerCase() || '').startsWith(str.toLowerCase());
  }

  includes(str) {
    return (this.text.toLowerCase() || '').includes(str.toLowerCase());
  }

  toJSON() {
    return {
      uuid: this.uuid,
      'call-uuid': this.callUUID,
      text: this.text,
      confidence: this.confidence,
      time: this.time
    };
  }
}

module.exports = Transcription;
