const Emitter = require('events');
const {v4} = require('uuid');
let eventStore;

class Event {
  constructor(type, callUUID, data) {
    this.uuid = v4();
    this.callUUID = callUUID;
    this.date = Date.now();
    this.type = type;
    this.data = data;
  }
}

class SessionEventStore extends Emitter {
  constructor(uuid, {callingNumber, calledNumber, agent}) {
    super();
    this.uuid = uuid;
    this.start = Date.now();
    this.callingNumber = callingNumber;
    this.calledNumber = calledNumber;
    this.agent = agent;
    this.events = [];
  }

  get status() {
    return this.stop ? 'completed' : 'in-progress';
  }

  get eventList() {
    return this.events;
  }

  end() {
    this.stop = Date.now();
    this.emit('end');
  }

  addTranscript(transcript) {
    const evt = new Event('transcript', this.uuid, transcript);
    this.events.push(evt);
    this.emit('event', evt);
  }
  addPrompt(prompt) {
    const evt = new Event('prompt', this.uuid, prompt);
    this.events.push(evt);
    this.emit('event', evt);
  }
  addIntent(intent) {
    const evt = new Event('intent', this.uuid, intent);
    this.events.push(evt);
    this.emit('event', evt);
  }
}

module.exports = (logger) => {


  class EventStore extends Emitter {
    constructor() {
      super();
      this.sessions = new Map();
      logger.info('constructed eventstore');
    }

    get callList() {
      return [...this.sessions]
        .map((c) => {
          const es = c[1];
          return {
            uuid: c[0],
            start: es.start,
            callingNumber: es.callingNumber,
            calledNumber: es.calledNumber,
            agent: es.agent,
            status: es.status,
            stop: es.stop
          };
        })
        .sort((a, b) => a.start - b.start);
    }

    add(uuid, obj) {
      logger.info(`added call ${uuid}`);
      const sessionEventStore = new SessionEventStore(uuid, obj);
      this.sessions.set(uuid, sessionEventStore);
      this.emit('callStatusChange', this.callList);
    }

    end(uuid) {
      logger.info(`ended call ${uuid}`);
      const sessionEventStore = this.sessions.get(uuid);
      if (sessionEventStore) {
        sessionEventStore.end();
        logger.info({events: sessionEventStore.events}, 'call ended');
      }
      this.emit('callStatusChange', this.callList);
    }

    queryCall(uuid) {
      return this.sessions.get(uuid);
    }

    addTranscript(uuid, transcript) {
      if (transcript.final) {
        const sessionEventStore = this.sessions.get(uuid);
        if (sessionEventStore) sessionEventStore.addTranscript({
          text: transcript.text,
          confidence: transcript.confidence
        });
      }
    }
    addIntent(uuid, intent) {
      const sessionEventStore = this.sessions.get(uuid);
      if (sessionEventStore) {
        sessionEventStore.addIntent(intent.name);
        if (intent.fulfillmentText) sessionEventStore.addPrompt(intent.fulfillmentText);
      }
    }

    purge(secsSinceClose = 60) {
      let purged = 0;
      const now = Date.now();
      for (const s of this.sessions) {
        const uuid = s[0];
        const data = s[1];
        if (data.stop && now - data.stop > secsSinceClose * 1000) {
          purged++;
          this.sessions.delete(uuid);
        }
      }
      if (purged) {
        logger.info(`purged ${purged} completed calls`);
        this.emit('callStatusChange', this.callList);
      }
    }
  }

  if (!eventStore) eventStore = new EventStore();

  return eventStore;
};
