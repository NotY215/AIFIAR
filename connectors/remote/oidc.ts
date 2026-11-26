import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { RemotePrincipal } from "./auth.js";
export interface OidcConfig { issuer:string; audience:string; jwksUrl:URL; cacheMs:number }
interface Jwk { kid?:string; kty?:string; use?:string; alg?:string; n?:string; e?:string }
const TOOLS=["aifiar_status","aifiar_list_models","aifiar_get_instructions","aifiar_prepare_repository"];
const PROFILES=["claude","gpt","grok","codex","cursor"];
const isRecord=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
export function loadOidcConfig(env=process.env):OidcConfig|null {
 const issuer=env.AIFIAR_OIDC_ISSUER,audience=env.AIFIAR_OIDC_AUDIENCE,jwks=env.AIFIAR_OIDC_JWKS_URL;
 if(!issuer&&!audience&&!jwks)return null;
 if(!issuer||!audience||!jwks)throw new Error("OIDC requires issuer, audience, and JWKS URL together.");
 let i:URL,j:URL;try{i=new URL(issuer);j=new URL(jwks)}catch{throw new Error("OIDC issuer and JWKS URL must be absolute URLs.")}
 if(i.protocol!=="https:"||j.protocol!=="https:"||i.username||i.password||j.username||j.password)throw new Error("OIDC issuer and JWKS URL must use HTTPS without embedded credentials.");
 const cacheMs=Number(env.AIFIAR_OIDC_JWKS_CACHE_MS??300000);if(!Number.isInteger(cacheMs)||cacheMs<10000||cacheMs>3600000)throw new Error("OIDC JWKS cache must be 10 seconds to one hour.");
 return{issuer:i.href,audience,jwksUrl:j,cacheMs};
}
export function createOidcVerifier(config:OidcConfig,fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 let cached:{expires:number;keys:Jwk[]}|undefined;let pending:Promise<Jwk[]>|undefined;
 async function getKeys():Promise<Jwk[]>{
  if(cached&&cached.expires>now())return cached.keys;
  if(!pending)pending=(async()=>{const response=await fetcher(config.jwksUrl,{method:"GET",headers:{accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error("JWKS fetch failed.");const body=await response.text();if(body.length>1048576)throw new Error("JWKS response too large.");let parsed:unknown;try{parsed=JSON.parse(body)}catch{throw new Error("Invalid JWKS JSON.");}if(!isRecord(parsed)||!Array.isArray(parsed.keys)||parsed.keys.length<1||parsed.keys.length>100)throw new Error("JWKS must contain 1 to 100 keys.");const keys=parsed.keys.filter((k):k is Jwk=>isRecord(k)&&k.kty==="RSA"&&k.use!=="enc"&&k.alg!=="HS256"&&typeof k.kid==="string"&&typeof k.n==="string"&&typeof k.e==="string");if(!keys.length)throw new Error("No supported RSA signing keys.");cached={keys,expires:now()+config.cacheMs};return keys})().finally(()=>{pending=undefined});
  return pending;
 }
 return async(header:string|undefined):Promise<RemotePrincipal|null>=>{
  if(!header||!/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(header))return null;const token=header.slice(7);if(token.length>16384)return null;const parts=token.split(".");if(parts.length!==3)return null;
  let h:unknown,c:unknown;try{h=JSON.parse(Buffer.from(parts[0]!,"base64url").toString());c=JSON.parse(Buffer.from(parts[1]!,"base64url").toString())}catch{return null}
  if(!isRecord(h)||h.alg!=="RS256"||typeof h.kid!=="string"||!isRecord(c))return null;
  const aud=typeof c.aud==="string"?[c.aud]:Array.isArray(c.aud)?c.aud:[],nowSec=Math.floor(now()/1000);
  if(c.iss!==config.issuer||!aud.includes(config.audience)||typeof c.exp!=="number"||!Number.isFinite(c.exp)||c.exp<=nowSec||c.exp>nowSec+86400||(typeof c.nbf==="number"&&c.nbf>nowSec+30)||typeof c.sub!=="string"||!/^[A-Za-z0-9._:@-]{1,128}$/.test(c.sub))return null;
  const scopes=typeof c.scope==="string"?c.scope.split(/\s+/):Array.isArray(c.scp)?c.scp:[];
  if(!scopes.includes("aifiar:read")||typeof c.aifiar_profile!=="string"||!PROFILES.includes(c.aifiar_profile)||!Array.isArray(c.aifiar_tools)||c.aifiar_tools.length===0||!c.aifiar_tools.every((x:unknown)=>typeof x==="string"&&TOOLS.includes(x))||new Set(c.aifiar_tools).size!==c.aifiar_tools.length)return null;
  const rpm=c.aifiar_requests_per_minute??60;if(!Number.isInteger(rpm)||Number(rpm)<1||Number(rpm)>600)return null;
  try{const jwks=await getKeys(),jwk=jwks.find(k=>k.kid===h.kid);if(!jwk)return null;const key=createPublicKey({key:jwk as JsonWebKey,format:"jwk"});if(!verifySignature("RSA-SHA256",Buffer.from(parts[0]+"."+parts[1]),key,Buffer.from(parts[2]!,"base64url")))return null;return{subject:c.sub,profile:c.aifiar_profile as RemotePrincipal["profile"],tools:c.aifiar_tools as string[],requestsPerMinute:Number(rpm)}}catch{return null}
 };
}