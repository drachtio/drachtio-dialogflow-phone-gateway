#!/bin/bash

cd ~admin
git clone https://github.com/davehorton/drachtio-dialogflow-phone-gateway.git -b simwood
cd ~admin/drachtio-dialogflow-phone-gateway
npm install

mv /tmp/ecosystem.config.js ~admin
chmod 0644 ~admin/ecosystem.config.js
chown -R admin:admin ~admin

# add entry to /etc/crontab to start mg-siprec app on startup
echo "@reboot admin /usr/bin/pm2 start /home/admin/ecosystem.config.js s--env production" | sudo tee -a /etc/crontab
echo "@reboot admin sudo env PATH=$PATH:/usr/bin pm2 logrotate -u admin" | sudo tee -a /etc/crontab
