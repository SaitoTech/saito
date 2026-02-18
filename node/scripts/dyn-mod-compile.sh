#!/bin/bash 

node ./config/build/webpack.config.dynmod.cjs --entrypoint=$1
base64 -i ./dist/dyn/web/dyn.module.js > ./dist/dyn/web/base.txt
printf "$(cat ./dist/dyn/web/base.txt)" >> ./dist/dyn_mod.js

