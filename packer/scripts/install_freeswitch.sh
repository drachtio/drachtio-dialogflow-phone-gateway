#!/bin/bash
VERSION=v1.10.1
GRPC_VERSION=v1.24.2

echo "freeswitch version being installed is ${VERSION}"
echo "grpc version being installed is ${GRPC_VERSION}"

# sudo wget  --no-check-certificate  -O - https://files.freeswitch.org/repo/deb/debian-unstable/freeswitch_archive_g0.pub | apt-key add -
# echo "deb http://files.freeswitch.org/repo/deb/debian-unstable/ `lsb_release -sc` main" | sudo tee -a /etc/apt/sources.list.d/freeswitch.list
# echo "deb-src http://files.freeswitch.org/repo/deb/debian-unstable/ `lsb_release -sc` main" | sudo tee -a /etc/apt/sources.list.d/freeswitch.list
git config --global pull.rebase true
cd /usr/local/src
git clone https://github.com/davehorton/freeswitch.git -b ${VERSION}
git clone https://github.com/warmcat/libwebsockets.git -b v3.2-stable
git clone https://github.com/davehorton/drachtio-freeswitch-modules.git -b master
git clone https://github.com/dpirch/libfvad.git
git clone https://github.com/grpc/grpc -b ${GRPC_VERSION}

# copy add-in modules into place
sudo cp -r /usr/local/src/drachtio-freeswitch-modules/modules/mod_audio_fork \
 /usr/local/src/freeswitch/src/mod/applications/mod_audio_fork
sudo cp -r /usr/local/src/drachtio-freeswitch-modules/modules/mod_dialogflow \
 /usr/local/src/freeswitch/src/mod/applications/mod_dialogflow
sudo cp -r /usr/local/src/drachtio-freeswitch-modules/modules/mod_google_transcribe \
 /usr/local/src/freeswitch/src/mod/applications/mod_google_transcribe
sudo cp -r /usr/local/src/drachtio-freeswitch-modules/modules/mod_google_tts \
 /usr/local/src/freeswitch/src/mod/applications/mod_google_tts

# build grpc
echo "building grpc"
cd /usr/local/src/grpc
git submodule update --init --recursive
cd third_party/protobuf
sudo ./autogen.sh && sudo ./configure && sudo make install
cd /usr/local/src/grpc
LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH make && sudo make install

# build googleapis
cd /usr/local/src/freeswitch/libs
git clone https://github.com/davehorton/googleapis -b dialogflow-v2-support
cd googleapis
echo "building googleapis"
LANGUAGE=cpp make

# build libwebsockets
echo "building libwebsockets"
cd /usr/local/src/libwebsockets
sudo mkdir -p build && cd build && sudo cmake .. -DCMAKE_BUILD_TYPE=RelWithDebInfo && sudo make && sudo make install

# build libfvad
echo "building libfvad"
cd /usr/local/src/libfvad
sudo autoreconf -i && sudo ./configure && sudo make && sudo make install

# patch freeswitch
cd /usr/local/src/freeswitch
sudo cp /tmp/configure.ac.patch .
sudo cp /tmp/configure.ac.grpc.patch .
sudo cp /tmp/Makefile.am.patch .
sudo cp /tmp/Makefile.am.grpc.patch .
sudo cp /tmp/modules.conf.in.patch  ./build
sudo cp /tmp/modules.conf.in.grpc.patch  ./build
sudo cp /tmp/modules.conf.vanilla.xml.grpc ./conf/vanilla/autoload_configs/modules.conf.xml
sudo cp /tmp/mod_opusfile.c.patch ./src/mod/formats/mod_opusfile

sudo patch < configure.ac.patch 
sudo patch < configure.ac.grpc.patch 
sudo patch < Makefile.am.patch
sudo patch < Makefile.am.grpc.patch
cd build
sudo patch < modules.conf.in.patch
sudo patch < modules.conf.in.grpc.patch
cd ../src/mod/formats/mod_opusfile
sudo patch < mod_opusfile.c.patch

# build freeswitch
cd /usr/local/src/freeswitch
sudo ./bootstrap.sh -j
sudo ./configure --with-lws=yes --with-grpc=yes
sudo make
sudo make install
sudo make cd-sounds-install cd-moh-install
sudo cp /tmp/acl.conf.xml /usr/local/freeswitch/conf/autoload_configs
sudo cp /tmp/event_socket.conf.xml /usr/local/freeswitch/conf/autoload_configs
sudo cp /tmp/switch.conf.xml /usr/local/freeswitch/conf/autoload_configs
sudo rm -Rf /usr/local/freeswitch/conf/dialplan/*
sudo rm -Rf /usr/local/freeswitch/conf/sip_profiles/*
sudo cp /tmp/mrf_dialplan.xml /usr/local/freeswitch/conf/dialplan
sudo cp /tmp/mrf_sip_profile.xml /usr/local/freeswitch/conf/sip_profiles
sudo cp /usr/local/src/freeswitch/conf/vanilla/autoload_configs/modules.conf.xml /usr/local/freeswitch/conf/autoload_configs
sudo cp /tmp/freeswitch.service /etc/systemd/system
sudo chown root:root -R /usr/local/freeswitch
sudo chmod 644 /etc/systemd/system/freeswitch.service
sudo sed -i -e 's/global_codec_prefs=OPUS,G722,PCMU,PCMA,H264,VP8/global_codec_prefs=PCMU,PCMA,OPUS,G722/g' /usr/local/freeswitch/conf/vars.xml
sudo sed -i -e 's/outbound_codec_prefs=OPUS,G722,PCMU,PCMA,H264,VP8/outbound_codec_prefs=PCMU,PCMA,OPUS,G722/g' /usr/local/freeswitch/conf/vars.xml
sudo sed -i -r -e 's/(.*)cmd="stun-set" data="external_rtp_ip=stun:stun.freeswitch.org"(.*)/\1cmd="exec-set" data="external_rtp_ip=curl -s http:\/\/instance-data\/latest\/meta-data\/public-ipv4"\2/g' /usr/local/freeswitch/conf/vars.xml
sudo systemctl enable freeswitch
sudo cp /tmp/freeswitch_log_rotation /etc/cron.daily/freeswitch_log_rotation
sudo chown root:root /etc/cron.daily/freeswitch_log_rotation
sudo chmod a+x /etc/cron.daily/freeswitch_log_rotation
