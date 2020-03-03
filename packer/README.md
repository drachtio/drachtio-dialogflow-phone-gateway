# packer-drachtio-freeswitch-dialogflow

A [packer](https://www.packer.io/) template to build an AMI that implements a [dialogflow](http://dialogflow.com/) telephony gateway for use with [Simwood](https://simwood.com) trunks.

## Installing 

```
$ packer build  \
-var 'aws_access_key=YOUR-ACCESS-KEY'  \
-var 'aws_secret_key=YOUR-SECRET-KEY' \
template.json
```

### variables
These variables can be specified on the `packer build` command line.  Defaults are listed below, where provided.
```
"aws_access_key": ""
```
Your aws access key.
```
"aws_secret_key": ""
```
Your aws secret key.

```
"region": "eu-west-2"
```
The region to create the AMI in

```
"ami_description": "drachtio dialogflow telephony gateway for Simwood"
```
AMI description.

```
"instance_type": "t2.medium"
```
EC2 Instance type to use when building the AMI.

### Firewall / Security Group
Your AWS security group should allow the following traffic into the instance:
- 5060/udp - (SIP) should be allowed in from Simwood gateways (listed at https://support.simwood.com/hc/en-us/articles/115008681607-Inbound-SIP)
- 40000 - 60000/udp (RTP) should be allowed in from anywhere

## Troubleshooting
The [Node.js application](https://github.com/davehorton/drachtio-dialogflow-phone-gateway) runs under the [pm2](https://pm2.keymetrics.io/) process manager, so application logs are available via 
```
pm2 log
```

Freeswitch logs can be found as per usual in `/usr/local/freeswitch/logs/freeswitch.log`

The pm2 ecosystem.config.js file that configures the environment for the aplication can be found at /home/admin/ecosystem.config.js.

