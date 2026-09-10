import net from 'node:net';

export class FixedWindowRateLimiter{
  constructor({limit=120,windowMs=60000,maxClients=10000}={}){if(!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1000||!Number.isInteger(maxClients)||maxClients<1)throw new Error('Rate limiter configuration is invalid.');this.limit=limit;this.windowMs=windowMs;this.maxClients=maxClients;this.clients=new Map()}
  consume(client,now=Date.now()){
    if(typeof client!=='string'||!client||!Number.isInteger(now)||now<0)throw new Error('Rate limiter client is invalid.');
    let entry=this.clients.get(client);if(!entry||now>=entry.resetAt){entry={count:0,resetAt:now+this.windowMs};if(!this.clients.has(client)&&this.clients.size>=this.maxClients){for(const [key,value] of this.clients)if(now>=value.resetAt)this.clients.delete(key);if(this.clients.size>=this.maxClients)this.clients.delete(this.clients.keys().next().value)}this.clients.set(client,entry)}
    if(entry.count>=this.limit)return{allowed:false,remaining:0,retryAfterSeconds:Math.max(1,Math.ceil((entry.resetAt-now)/1000))};
    entry.count++;return{allowed:true,remaining:this.limit-entry.count,retryAfterSeconds:0};
  }
}

export class TtlCache{
  constructor({ttlMs=3000,maxEntries=500}={}){if(!Number.isInteger(ttlMs)||ttlMs<1||!Number.isInteger(maxEntries)||maxEntries<1)throw new Error('Cache configuration is invalid.');this.ttlMs=ttlMs;this.maxEntries=maxEntries;this.values=new Map()}
  get(key,now=Date.now()){const entry=this.values.get(key);if(!entry)return null;if(now>=entry.expiresAt){this.values.delete(key);return null}return entry.value}
  set(key,value,now=Date.now()){if(!this.values.has(key)&&this.values.size>=this.maxEntries)this.values.delete(this.values.keys().next().value);this.values.delete(key);this.values.set(key,{value,expiresAt:now+this.ttlMs})}
}

export function clientAddress(request,{trustProxy=false}={}){
  let value=String(request?.socket?.remoteAddress||'');
  if(trustProxy){const forwarded=String(request?.headers?.['x-forwarded-for']||'').split(',')[0].trim();if(forwarded)value=forwarded}
  if(value.startsWith('::ffff:'))value=value.slice(7);
  if(!net.isIP(value))throw new Error('Client address is invalid.');return value;
}
