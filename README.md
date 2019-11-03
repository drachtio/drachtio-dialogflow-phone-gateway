# drachtio-dialogflow-phone-gateway

An open source telephony gateway for Google Dialogflow.  All you need is a SIP trunk pointed to a server configured with the required software, and you're good to go. 

## Features
- Full dialogflow telephony integration
- Call transfer via either SIP REFER or INVITE (requires support from your SIP trunking provider).
- playback interruption / barge-in via configurable hotword or phrase
- no activity detection
- recording support
- support for ambient typing sound while long-running fulfillment activity is happening

## Prerequisites
You'll need a server outfitted with the following software:

- [drachtio server](https://drachtio.org)
- Freeswitch 1.10.1 (custom build to integrate with drachtio and dialogflow, see below for details)
- [dialogflow module](https://github.com/davehorton/drachtio-freeswitch-modules/tree/master/modules/mod_dialogflow) for Freeswitch

Of course, you will also need a [dialogflow](https://dialogflow.com/) account, and a google cloud account.

## Installation
The suggested linux distribution to run on is Debian 9. The easiest way to build yourself a server with all this is to use ansible, and create a playbook that runs the following roles:
* drachtio server [ansible role](https://github.com/davehorton/ansible-role-drachtio)
* freeswitch [ansible role](https://github.com/davehorton/ansible-role-fsmrf), builds v1.10.1 Freeswitch with support for grpc and drachtio
* nodejs [ansible role](https://github.com/davehorton/ansible-role-nodejs)

Create yourself a playbook like the following:
```
---
- hosts: all
  become: yes
  vars:
    drachtioBranch: v0.8.2
  vars_prompt:
    - name: "build_with_grpc"
      prompt: "Include the grpc modules (mod_google_transcribe, mod_google_tts, mod_dialogflow)?"
      private: no
      default: false
    - name: "cloud_provider"
      prompt: "Cloud provider: aws, gcp, azure, digital_ocean"
      private: no
      default: none

  roles:
    - ansible-role-fsmrf
    - ansible-role-nodejs
    - ansible-role-drachtio
```
Run it using `ansible-playbook`, answering 'True' to the question about install grpc support.

## Configuration

### Dialogflow authentication
To authenticate with dialogflow, you will need to log into Google Cloud Platform and generate a service account json key file.  Make sure you enable the APIs needed for dialogflow.  Download the json file and place it on your server somewhere. 

Then, edit your `/etc/systemd/system/freeswitch.service` systemd file, creating an environment variable named `GOOGLE_APPLICATION_CREDENTIALS` that points to it; i.e. add a line like this:
```
Environment=“GOOGLE_APPLICATION_CREDENTIALS=/home/admin/<your-service-key>.json
```

After doing that, reload and restart the systemd service:
```
systemctl daemon-reload
systemctl restart freeswitch
```

### Dialogflow configuration
In the dialogflow console, make you have done the following:
* on the Speech tab, enable "Enable Automatic Text to Speech"
* for Output Audio Encoding, select "16 bit linear PCM
* on the General tab, enable "Enable beta features and APIs".

### Application configuration
The application configuration file can be found in config/local.json.  It consists of the following sections:

```
  "drachtio": {
    "host": "127.0.0.1",
    "port": 9022,
    "secret": "cymru"
  }
```
specifies the location of the drachtio server to connect to.

```
  "freeswitch": {
    "address": "127.0.0.1",
    "port": 8021,
    "secret": "ClueCon"
  }
```
specifies the location of the freeswitch server to connect to.

```
  "logging": {
    "level": "debug"
  }
```
specifies log levels: info or debug

```
  "dialogflow": {
    "project": "<dialogflow-project-id-goes-here>",
    "lang": "en-US",
    "events": {
      "welcome": "welcome"
    }
    "hotword": "OK Google"
  }
```
project - the dialogflow agent to execute
lang - language dialect to use, 
events.welcome - optional, if provided an event to send with the initial dialogflow streaming intent request
hostword - hotword or phrase to use to "barge in" (i.e. interrupt audio).

```
  "callTransfer": {
    "method": "REFER",
    "domain": "foo.bar"
  }
```
method - indicates method to use for call transfer: REFER or INVITE
domain - optional, if provided specifies the domain name to put in the Refer-To and Referred-By headers

```
  "typing-sound": "/tmp/typing-sound.mp3"
```
Optionally, indicates the path to a .wav or .mp3 sound file to play while a fullfilment action is occurring.  The audio will begin playing when an end of utterance has been detected, and will stop when the subsequent audio prompt from dialogflow arrives.

Note: an example typing sound file can be found in sounds/keyboard-typing.wav of this project.