/* Shareable Hylian Translator configurations. */
(function () {
  'use strict';
  const button = document.getElementById('shareLinkBtn');
  const state = window.HylianTranslatorState;
  if (!button || !state) return;
  const text = (key, fallback) => (window.PAGE_TEXT && window.PAGE_TEXT[key]) || fallback;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  function toB64(bytes) {
    let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  }
  function fromB64(value) {
    const b=value.replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(b+'='.repeat((4-b.length%4)%4));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }
  // Raw deflate (no 18-byte gzip wrapper).
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function deflate(bytes) { return 'CompressionStream' in window ? pipe(bytes, new CompressionStream('deflate-raw')) : null; }
  async function inflate(bytes) {
    if(!('DecompressionStream' in window)) throw new Error('This browser cannot open this shared link.');
    return pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  /* Compact binary payload, then base64url. Deliberately holds NO language: the link opens in the visitor's own language.
     byte 0 : bits 0-3 script index (15 = unknown), bit 4 Twilight Princess Wii variant, bit 5 colour follows (3 bytes),
              bit 6 size follows (1 byte, size x 10), bit 7 reverse (Hylian -> real world) mode
     byte 1 : only in reverse mode: bit 0 mirrored text
     rest   : UTF-8 text (reverse mode: the typed key tokens joined by U+001F). Only the visible mode's content is shared. */
  const SCRIPTS=['ocarinaOfTime3d','ocarinaOfTime64','windwaker','twilightPrincess','skywardSword','botw','gerudo','sheikah','mudoran'];
  const SEP='\u001f';
  function pack(s) {
    const rev=s.rev||{}, isRev=!!rev.reverse, head=[];
    const idx=SCRIPTS.indexOf(s.version);
    const color=/^#[0-9a-f]{6}$/i.test(s.color||'') && s.color.toLowerCase()!=='#000000' ? s.color.slice(1) : null;
    const size=Math.round(parseFloat(s.size)*10), hasSize=Number.isFinite(size) && size>=1 && size<=255 && size!==25;
    head.push((idx<0?15:idx) | (s.tp==='wii'?16:0) | (color?32:0) | (hasSize?64:0) | (isRev?128:0));
    if(isRev) head.push(rev.mirrorEnabled?1:0);
    if(color) for(let i=0;i<3;i++) head.push(parseInt(color.substr(i*2,2),16));
    if(hasSize) head.push(size);
    const body=encoder.encode(isRev ? (Array.isArray(rev.tokens)?rev.tokens:[]).join(SEP) : (s.text||''));
    const out=new Uint8Array(head.length+body.length); out.set(head); out.set(body,head.length); return out;
  }
  function unpack(b) {
    if(!b.length) throw new Error('Empty shared link');
    const f=b[0]; let i=1, mirror=false, color='#000000', size='2.5';
    const isRev=!!(f&128);
    if(isRev) { if(b.length<2) throw new Error('Truncated shared link'); mirror=!!(b[i++]&1); }
    if(f&32) { if(b.length<i+3) throw new Error('Truncated shared link'); color='#'+[0,1,2].map(k=>b[i+k].toString(16).padStart(2,'0')).join(''); i+=3; }
    if(f&64) { if(b.length<=i) throw new Error('Truncated shared link'); size=String(b[i++]/10); }
    const body=decoder.decode(b.subarray(i)), idx=f&15;
    return {v:1,text:isRev?'':body,version:idx<SCRIPTS.length?SCRIPTS[idx]:undefined,tp:f&16?'wii':'gamecube',color,size,
      rev:{reverse:isRev,tokens:isRev&&body?body.split(SEP):[],outLang:null,mirrorEnabled:mirror}};
  }
  /* Integrity check: 3 bytes (FNV-1a 32-bit with a fixed salt, top 24 bits) appended to the payload. A link that was edited by hand,
     cut off, or mangled by a chat app fails the check and is ignored. It is NOT a secret signature: anyone who reads this code can
     make a valid link - exactly as anyone can by pressing Share - it only guarantees a link is intact and was made by the site. */
  const SALT=encoder.encode('hylian-share-v1');
  function checksum(kind, bytes) {
    let h=0x811c9dc5;
    for(const b of SALT) { h^=b; h=Math.imul(h,0x01000193); }
    h^=kind.charCodeAt(0); h=Math.imul(h,0x01000193);
    for(const b of bytes) { h^=b; h=Math.imul(h,0x01000193); }
    h>>>=0; return [h>>>24, (h>>>16)&255, (h>>>8)&255];
  }
  function seal(kind, bytes) { const out=new Uint8Array(bytes.length+3); out.set(bytes); out.set(checksum(kind,bytes),bytes.length); return kind+toB64(out); }
  function unseal(kind, value) { // verified payload bytes, or null if the link was altered
    const all=fromB64(value); if(all.length<4) return null;
    const bytes=all.subarray(0,all.length-3), sum=checksum(kind,bytes);
    return sum.every((v,i)=>v===all[bytes.length+i]) ? bytes : null;
  }
  async function makeUrl() {
    const raw=pack(state.get()), packed=await deflate(raw);
    const payload=packed && packed.length<raw.length ? seal('q.',packed) : seal('p.',raw);
    // language-neutral address: the site root, never the sender's /ja/, /de/ ... page
    const url=new URL((window.PAGE_TEXT&&window.PAGE_TEXT.root)||'./', location.href);
    if(url.protocol==='file:' && url.pathname.endsWith('/')) url.pathname+='index.html'; // local testing only
    url.search=''; url.hash='s='+payload; return url.href;
  }
  // Shared links point at the root (English) page: send visitors whose browser prefers another site language to that language.
  function localise() {
    if(((window.PAGE_TEXT&&window.PAGE_TEXT.root)||'')!=='' || document.documentElement.lang!=='en' || !/^#s=/.test(location.hash)) return false;
    const options=[...document.querySelectorAll('#languageSelect option')];
    for(const tag of (navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language])) {
      const base=String(tag||'').toLowerCase().split('-')[0];
      if(base==='en') return false;
      const hit=options.find(o=>(o.lang||'').toLowerCase().split('-')[0]===base);
      if(hit) { location.replace(hit.value+location.hash); return true; }
    }
    return false;
  }
  const dropHash=()=>{ try { history.replaceState(null,'',location.pathname+location.search); } catch(e) { /* ignore */ } };
  async function readUrl() {
    if(!/^#s=/.test(location.hash)) return;
    const m=location.hash.match(/^#s=(p\.|q\.)([A-Za-z0-9_-]{4,20000})$/);
    if(!m) return dropHash();
    if(localise()) return;
    try {
      const bytes=unseal(m[1],m[2]); if(!bytes) throw new Error('integrity check failed');
      const config=unpack(m[1]==='q.'?await inflate(bytes):bytes);
      if(state.hadSavedSettings) { state.setSharedMode(true); state.apply(config); showNotice(); } // protect the visitor's own saved settings
      else { state.apply(config); dropHash(); } // first-time visitor: nothing to protect, so no notice; it simply becomes their starting point
    } catch(err) { dropHash(); } // altered or unreadable link: silently ignored, the visitor's own/default settings stay
  }
  function showNotice() {
    const notice=document.createElement('aside'); notice.className='shared-config-notice'; notice.setAttribute('role','status');
    const message=document.createElement('span');
    message.textContent=text('sharedLinkNotice','You are viewing someone else’s shared configuration. Your saved settings are unchanged.');
    const restore=document.createElement('button'); restore.type='button'; restore.textContent=text('returnToMySettings','Return to my settings');
    restore.addEventListener('click',()=>{state.restorePersonal();history.replaceState(null,'',location.pathname+location.search);notice.remove();});
    notice.append(message,restore); const header=document.querySelector('header');
    if(header) header.insertAdjacentElement('afterend',notice); else document.body.prepend(notice);
  }
  button.addEventListener('click',async()=>{
    const label=button.querySelector('.btn-label')||button, original=label.textContent; button.disabled=true;
    try {
      const url=await makeUrl();
      if(navigator.share) await navigator.share({title:'Hylian Translator',text:'Open this Hylian translation:',url});
      else { await navigator.clipboard.writeText(url); label.textContent=text('shareLinkCopied','Link copied!'); setTimeout(()=>{label.textContent=original;},1800); }
    } catch(err) { if(err.name!=='AbortError') alert(err.message||'Could not create or share the link.'); }
    finally { button.disabled=false; }
  });
  readUrl();
})();
