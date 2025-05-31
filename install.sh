#!/bin/bash

platform='unknown'
packagemanager='unknown'
unamestr=`uname`
if [[ "$unamestr" == 'Linux' ]]; then
   platform='linux'
   packagemanager='apt-get'
elif [[ "$unamestr" == 'Darwin' ]]; then
   platform='macosx'
   packagemanager='brew'
fi
if [[ $platform == 'unknown' ]]; then
    echo "Unknown platform detected - OS X and Ubuntu currently supported."
    exit 1
fi

if [ "$(id -u)" != "0" ]; then
	echo "This installer requires root permissions - please run sudo ./install.sh instead"'!'
	exit 1
fi

echo "------------------------------------------------------"
echo "------ INSTALLING THE WUB MACHINE'S DEPENDENCIES -----"
echo "----------  Be careful, this might not work ----------"
echo "--------- In fact, this might screw things up --------"
echo "-- I take no responsibility if something goes wrong. -"
echo "------------------------------------------------------"
echo "-- Really, all this script does is run a bunch of   --"
echo "-- $packagemanager installs and pip installs.                  --"
echo "-- A little bit of code is downloaded from Github.  --"
echo "-- You'll get FFMpeg, LAME, SoundStretch, SHNtool...--"
echo "------------------------------------------------------"
echo
read -p "Do you agree and take all responsibility if something goes wrong? (y/n): " RESP
if [ $RESP != "y" ]; then
  echo "Exiting."
  exit 0
fi

hash $packagemanager 2>&- || { echo >&2 "This installer requires $packagemanager."; exit 1; }

# Install Python-dev
if [[ $platform == 'linux' ]]; then
    apt-get update -y
    apt-get install -y git-core python3-setuptools python3.10-dev build-essential python3-pip

    # Install server-specific stuff: SQLAlchemy, python-socketio
    apt-get install -y default-libmysqlclient-dev
    python3 -m pip install mysqlclient
    python3 -m pip install sqlalchemy
    python3 -m pip install tornado>=5.0
    python3 -m pip install "python-socketio[asgi,asyncio_client]"

    # Other handy things
    apt-get install -y libyaml-dev
    python3 -m pip install pyyaml
    python3 -m pip install numpy
    python3 -m pip install mutagen
    python3 -m pip install librosa
    python3 -m pip install soundfile

    apt-get install -y libjpeg-dev
    python3 -m pip install Pillow

    # FFMpeg is a dependency for Librosa and general audio processing
    apt-get install -y ffmpeg
    # Echonest specific symlink and install removed

    # Command-line programs used to speed up remixing
    apt-get install -y lame soundstretch shntool

else
    hash easy_install 2>&- || hash pip 2>&- || { echo >&2 "This installer requires easy_install or pip."; exit 1; }
    hash pip 2>&- || easy_install pip

    # Install server-specific stuff: SQLAlchemy, python-socketio
    python3 -m pip install mysqlclient
    python3 -m pip install sqlalchemy
    python3 -m pip install tornado>=5.0
    python3 -m pip install "python-socketio[asgi,asyncio_client]"

    # Other handy things
    brew install libyaml
    python3 -m pip install pyyaml
    python3 -m pip install numpy
    python3 -m pip install mutagen
    python3 -m pip install librosa
    python3 -m pip install soundfile

    brew install jpeg
    python3 -m pip install Pillow

    # FFMpeg is a dependency for Librosa and general audio processing
    hash ffmpeg 2>&- || brew install ffmpeg
    # Echonest specific symlink and install removed

    # Command-line programs used to speed up remixing
    brew install lame
    
    wget "http://www.surina.net/soundtouch/soundstretch_mac_osx_x64_1.6.0.zip"
    unzip "soundstretch_mac_osx_x64_1.6.0.zip"
    mv ./soundstretch /usr/bin/soundstretch
    rm "soundstretch_mac_osx_x64_1.6.0.zip"
    
    brew install shntool
fi
