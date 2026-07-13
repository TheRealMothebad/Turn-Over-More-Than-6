#!/usr/bin/env bash

sudo docker build -t turn-over-more-than-6 . &&
sudo docker save -o tomt6.tar turn-over-more-than-6:latest &&
sudo chmod a+r tomt6.tar &&
curl -k -X POST \
  -H "X-API-Key: $(cat portainer_secret)" \
  -H "Content-Type: application/x-tar" \
  --data-binary @tomt6.tar \
  "https://$(cat vps_ipaddr):9443/api/endpoints/9b5de451ccc5c060ff79b66660536460ac5f77bdbb1448f3f143cba14b998a0d/docker/images/load"
