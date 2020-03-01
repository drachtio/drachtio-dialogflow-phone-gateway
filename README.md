# drachtio-dialogflow-phone-gateway

An open source telephony gateway for Google's [dialogflow](dialogflow.com).  This branch is preconfigured to send call transfers through [Simwood](https://simwood.com/).

The dialogflow gateway includes:

- Full dialogflow telephony integration
- Call transfer to any E-164 number, including non-US destinations
- Support for DMTF entry alonside speech as a way of responding to prompts
- configurable no input timeout
- playback interruption / barge-in via configurable hotword or phrase
- support for ambient typing sound while long-running fulfillment activity is happening
- websocket API to receive streaming real-time transcriptions and intents from the gateway; for example to enable agent augmentation

## Configuration

The following environment variables are used to provide run-time configuration to the application (optionally, a configuration file can be used instead of environment variables; see config/local.json.example for details).

#### Application configuration

|Environment Variable Name|Description| Required?|
|------------|---------|---------|
|GOOGLE_APPLICATION_CREDENTIALS|path to a json key file containing GCP credentials used to authenticate to dialogflow|Yes|
|DIALOGFLOW_PROJECT|the dialogflow project id to connect calls to|Yes|
|DIALOGFLOW_LANG|language to use for the dialogflow session|No (default: en-us)|
|DIALOGFLOW_WELCOME_EVENT|name of initial event to send to dialogflow when connecting call|No|
|DIALOGFLOW_NO_INPUT_TIMEOUT|number of seconds of no detected intent to allow to pass before reprompting the caller|No|
DIALOGFLOW_ENABLE_DTMF_ALWAYS| if 1, dtmf will always be collected and sent to dialogflow as a text input|No(default: 1)|
|DIALOGFLOW_INTERDIGIT_TIMEOUT|number of milliseconds to wait after collecting a dtmf before sending the collected dtmf digits to dialogflow as a text query|No (default: 3000)|
|DIALOGFLOW_BARGE_PHRASE|a phrase that when uttered by the caller will cause audio playback to the caller to cease|No|
|DIALOGFLOW_THINKING_SOUND|path to an audio file (wav or mp3) to play while dialogflow intent detection and back-end fulfillment are proceeding|No|
|HTTP_PORT|http port of websocket server to listen on for incoming client connections|No|
|SIP_TRUNK_GATEWAY|IP address or DNS to send outbound INVITEs to for call transfer|No, but call transfer will be disabled if not specified|

#### Dialogflow configuration
In the dialogflow console, make you have done the following:
* on the Speech tab, enable "Enable Automatic Text to Speech"
* for Output Audio Encoding, select 16 bit linear PCM or mp3
* on the General tab, enable "Enable beta features and APIs".

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