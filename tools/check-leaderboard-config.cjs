'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {checkConfig}=require('../leaderboard-client.js');
const scope={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../leaderboard-config.js'),'utf8'),scope,{timeout:100});
const verdict=checkConfig(scope.window.DAZOUGU_LEADERBOARD_CONFIG);
if(verdict.ready)console.log('PASS public project URL and browser-safe key configured (values hidden)');
else if(verdict.reason==='missing'&&!process.argv.includes('--require-config'))console.log('NOT CONNECTED: public configuration is still empty; game stays playable');
else{console.error('STOP: invalid, missing or privileged configuration. Do not publish. Use only the Project URL and publishable key.');process.exitCode=1;}
