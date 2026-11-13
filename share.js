/* Shareable Hylian Translator configurations. */
(function () {
  'use strict';
  const button = document.getElementById('shareLinkBtn');
  const state = window.HylianTranslatorState;
  if (!button || !state) return;
  const text = (key, fallback) => (window.PAGE_TEXT && window.PAGE_TEXT[key]) || fallback;
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  function toB64(bytes) {
    let binary=''; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  }
  function fromB64(value) {
    const b=value.replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(b+'='.repeat((4-b.length%4)%4));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }
  // Streams: gzip is kept only to read old links; new links use raw deflate (no 18-byte gzip wrapper).
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function deflate(bytes) { return 'CompressionStream' in window ? pipe(bytes, new CompressionStream('deflate-raw')) : null; }
  async function inflate(bytes) {
    if(!('DecompressionStream' in window)) throw new Error('This browser cannot open this shared link.');
    return pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  async function gunzip(bytes) { // legacy links
    if(bytes[0]===0x1f && bytes[1]===0x8b) {
      if(!('DecompressionStream' in window)) throw new Error('This browser cannot open this shared link.');
      return pipe(bytes, new DecompressionStream('gzip'));
    }
    return bytes;
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
  function expandLegacy(p) { // old JSON links (they could carry the sender's output language; it is ignored now)
    if(p&&p.v===1&&p.config) return p.config;
    const r=p.r||{};
    return {v:1,text:p.t||'',version:p.v||'twilightPrincess',tp:p.p?'wii':'gamecube',color:p.c||'#000000',size:p.z||'2.5',
      rev:{reverse:!!r.b,tokens:Array.isArray(r.k)?r.k:[],outLang:null,mirrorEnabled:!!r.m}};
  }
  async function makeUrl() {
    const raw=pack(state.get()), packed=await deflate(raw);
    const payload=packed && packed.length<raw.length ? 'q.'+toB64(packed) : 'p.'+toB64(raw);
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
  async function readUrl() {
    const m=location.hash.match(/^#s=(?:(g\.|j\.|p\.|q\.))?([A-Za-z0-9_-]+)$/); if(!m) return;
    if(localise()) return;
    try {
      const bytes=fromB64(m[2]); let config;
      if(m[1]==='p.') config=unpack(bytes);
      else if(m[1]==='q.') config=unpack(await inflate(bytes));
      else config=expandLegacy(JSON.parse(decoder.decode(m[1]==='j.'?bytes:await gunzip(bytes)))); // old links
      if(!config||typeof config!=='object') throw new Error('Invalid shared configuration');
      state.setSharedMode(true); state.apply(config); showNotice(false);
    } catch(err) { console.warn('Could not load shared Hylian Translator configuration:',err); showNotice(true); }
  }
  function showNotice(invalid) {
    const notice=document.createElement('aside'); notice.className='shared-config-notice'; notice.setAttribute('role','status');
    const message=document.createElement('span');
    message.textContent=invalid?text('sharedLinkInvalid','This shared configuration could not be loaded.'):
      text('sharedLinkNotice','You are viewing someone else’s shared configuration. Your saved settings are unchanged.');
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
