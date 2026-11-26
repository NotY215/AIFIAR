#!/usr/bin/env node
import{randomBytes}from"node:crypto";
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf("=");return i>0?[x.slice(0,i),x.slice(i+1)]:[x,"true"]}));
const profile=(args["--profile"]??"codex").toLowerCase(),subject=args["--subject"]??"aifiar-user",valid=["claude","gpt","grok","codex","cursor"];
if(!valid.includes(profile)||!/^[A-Za-z0-9._:@-]{1,128}$/.test(subject)){process.stderr.write("Usage: node scripts/generate-connector-token.mjs --profile=codex --subject=user-1\n");process.exit(2)}
const token=randomBytes(32).toString("base64url");
const tools=["aifiar_status","aifiar_list_models","aifiar_get_instructions","aifiar_prepare_repository"];
process.stdout.write(JSON.stringify([{token,subject,profile,tools,requestsPerMinute:60}],null,2)+"\n");
process.stderr.write("Store this output in your secret manager as AIFIAR_REMOTE_TOKENS. The token is shown only once.\n");