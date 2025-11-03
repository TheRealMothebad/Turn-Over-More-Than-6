#!/bin/bash

sudo docker build -t turn-over-more-than-6 .
sudo docker save -o tomt6.tar turn-over-more-than-6:latest
