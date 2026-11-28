// Writes one ready-made page per public venue (dist/desporto24/venues/<id>/index.html) so search engines
// read the venue's name, place and sports without running JavaScript. The page is the normal app shell
// with its own title, description, canonical link, structured data and a short readable summary inside
// <app-root>; Angular replaces that summary as soon as it starts, so people see the usual page.
// Never breaks a deploy: if the API cannot be reached, the site is published without these pages.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const SITE='https://jynlosports.com';
const API=(process.env.JYNLO_PRERENDER_API||'https://api.jynlosports.com').replace(/\/+$/,'');
const dist=resolve('dist/desporto24');
const template=readFileSync(resolve(dist,'index.html'),'utf8');

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clip=(v,n)=>{const s=String(v).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).replace(/\s+\S*$/,'')+'…':s;};
const sportsOf=v=>String(v.sports||'').split(/[,;|]/).map(s=>s.trim()).filter(Boolean);

function page({title,description,path,jsonLd,body}){
 const url=SITE+path;
 let html=template
  .replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`)
  .replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${esc(description)}">`)
  .replace(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${esc(title)}">`)
  .replace(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${esc(description)}">`)
  .replace(/<meta property="og:image:alt" content="[^"]*">/,`<meta property="og:image:alt" content="${esc(title)}">`)
  .replace(/<meta name="twitter:title" content="[^"]*">/,`<meta name="twitter:title" content="${esc(title)}">`)
  .replace(/<meta name="twitter:description" content="[^"]*">/,`<meta name="twitter:description" content="${esc(description)}">`)
  .replace('</head>',`  <link rel="canonical" href="${esc(url)}">\n  <meta property="og:url" content="${esc(url)}">\n`+
   (jsonLd?`  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,'\\u003c')}</script>\n`:'')+'</head>')
  .replace('<app-root></app-root>',`<app-root>${body}</app-root>`);
 const dir=resolve(dist,'.'+path);
 mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'index.html'),html);
}

function venuePage(v){
 const sports=sportsOf(v);
 const where=[v.city,v.district&&v.district!==v.city?v.district:null].filter(Boolean).join(', ');
 const sportsText=sports.slice(0,3).join(', ');
 const title=clip(`${v.name}${sportsText?' · '+sportsText:''}${v.city?' em '+v.city:''}`,62)+' · Jynlo';
 const description=clip(`${v.name}${where?' em '+where:''}.${sports.length?' Modalidades: '+sports.join(', ')+'.':''} Vê como chegar e como reservar, e encontra ou cria jogos neste recinto na Jynlo.`,158);
 const facts=[
  v.address?`<li>Morada: ${esc(v.address)}</li>`:'',
  sports.length?`<li>Modalidades: ${esc(sports.join(', '))}</li>`:'',
  v.environment?`<li>${v.environment==='INDOOR'?'Interior':v.environment==='OUTDOOR'?'Exterior':'Interior e exterior'}</li>`:'',
  v.surfaceType?`<li>Piso: ${esc(v.surfaceType)}</li>`:'',
  v.openingHours?`<li>Horário: ${esc(clip(v.openingHours,140))}</li>`:'',
  v.priceInfo?`<li>Preço: ${esc(clip(v.priceInfo,140))}</li>`:'',
  v.parking?'<li>Estacionamento</li>':'',
  v.lighting?'<li>Iluminação</li>':'',
 ].join('');
 const jsonLd={'@context':'https://schema.org','@type':'SportsActivityLocation',name:v.name,url:`${SITE}/venues/${v.id}`,
  address:{'@type':'PostalAddress',...(v.address?{streetAddress:v.address}:{}),...(v.city?{addressLocality:v.city}:{}),
   ...(v.district?{addressRegion:v.district}:{}),addressCountry:'PT'},
  ...(Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)?{geo:{'@type':'GeoCoordinates',latitude:v.latitude,longitude:v.longitude}}:{}),
  ...(sports.length?{sport:sports}:{})};
 const body=`<main class="prerender-page"><h1>${esc(v.name)}</h1>${where?`<p>${esc(where)}</p>`:''}<ul>${facts}</ul>`+
  `<p><a href="/venues/${v.id}">Ver o recinto na Jynlo</a> · <a href="/for-venues">Gere este recinto? Recebe reservas sem custos</a></p></main>`;
 page({title,description,path:`/venues/${v.id}`,jsonLd,body});
}

// Same rule as src/app/shared/sport-city-slug.ts.
const slug=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
/** Sport and city pairs with at least MIN venues become "Jogos de <desporto> em <cidade>" pages. */
const MIN_VENUES=2,MAX_PAIRS=4000;
function sportCityPairs(venues){
 const pairs=new Map(),names=new Map();
 const vote=(key,name)=>{const m=names.get(key)||new Map();m.set(name,(m.get(name)||0)+1);names.set(key,m);};
 const best=key=>[...(names.get(key)||new Map()).entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||key;
 for(const v of venues){
  const city=String(v.city||'').trim();const c=slug(city);if(!c)continue;vote('c:'+c,city);
  for(const sport of new Set(sportsOf(v))){
   const s=slug(sport);if(!s)continue;vote('s:'+s,sport.charAt(0).toUpperCase()+sport.slice(1));
   const key=s+'/'+c;const p=pairs.get(key)||{s,c,list:[]};p.list.push(v);pairs.set(key,p);
  }
 }
 return [...pairs.values()].filter(p=>p.list.length>=MIN_VENUES)
  .map(p=>({s:p.s,c:p.c,sport:best('s:'+p.s),city:best('c:'+p.c),venues:p.list.length,list:p.list}))
  .sort((a,b)=>b.venues-a.venues).slice(0,MAX_PAIRS);
}
function sportCityPage(p,all){
 const title=`Jogos de ${p.sport} em ${p.city} · Jynlo`;
 const description=clip(`Jogos de ${p.sport} em ${p.city} com vagas, ${p.venues} recintos onde se joga e como criar o teu jogo na Jynlo.`,158);
 const venuesHtml=p.list.slice(0,20).map(v=>`<li><a href="/venues/${v.id}">${esc(v.name)}</a></li>`).join('');
 const others=all.filter(o=>o.s===p.s&&o.c!==p.c).slice(0,12).map(o=>`<li><a href="/jogos/${o.s}/${o.c}">${esc(o.sport)} em ${esc(o.city)}</a></li>`).join('');
 const sports=all.filter(o=>o.c===p.c&&o.s!==p.s).slice(0,12).map(o=>`<li><a href="/jogos/${o.s}/${o.c}">${esc(o.sport)} em ${esc(o.city)}</a></li>`).join('');
 const body=`<main class="prerender-page"><h1>Jogos de ${esc(p.sport)} em ${esc(p.city)}</h1>`+
  `<p>Encontra jogos de ${esc(p.sport)} com vagas em ${esc(p.city)} ou cria o teu e convida quem joga perto de ti.</p>`+
  `<h2>Recintos com ${esc(p.sport)} em ${esc(p.city)}</h2><ul>${venuesHtml}</ul>`+
  (others?`<h2>${esc(p.sport)} noutras cidades</h2><ul>${others}</ul>`:'')+
  (sports?`<h2>Outros desportos em ${esc(p.city)}</h2><ul>${sports}</ul>`:'')+
  `<p><a href="/jogos">Todos os desportos e cidades</a></p></main>`;
 const jsonLd={'@context':'https://schema.org','@type':'CollectionPage',name:`Jogos de ${p.sport} em ${p.city}`,url:`${SITE}/jogos/${p.s}/${p.c}`,
  about:{'@type':'Place',name:p.city,address:{'@type':'PostalAddress',addressLocality:p.city,addressCountry:'PT'}}};
 page({title,description,path:`/jogos/${p.s}/${p.c}`,jsonLd,body});
}
function sportCityHub(pairs){
 const bySport=new Map();for(const p of pairs){bySport.set(p.s,[...(bySport.get(p.s)||[]),p]);}
 const groups=[...bySport.values()].sort((a,b)=>b.length-a.length)
  .map(list=>`<h2>${esc(list[0].sport)}</h2><ul>${list.map(p=>`<li><a href="/jogos/${p.s}/${p.c}">${esc(p.city)}</a></li>`).join('')}</ul>`).join('');
 page({title:'Jogos por desporto e cidade · Jynlo',description:'Encontra jogos de padel, futebol, ténis e outros desportos na tua cidade, e os recintos onde se joga.',path:'/jogos',
  body:`<main class="prerender-page"><h1>Jogos por desporto e cidade</h1>${groups}</main>`});
 writeFileSync(resolve(dist,'assets/jogos-index.json'),JSON.stringify(pairs.map(({s,c,sport,city,venues})=>({s,c,sport,city,venues}))));
 const today=new Date().toISOString().slice(0,10);
 writeFileSync(resolve(dist,'sitemap-jogos.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
  [`/jogos`,...pairs.map(p=>`/jogos/${p.s}/${p.c}`)].map(u=>`  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${u==='/jogos'?'0.7':'0.6'}</priority></url>`).join('\n')+'\n</urlset>\n');
}

const STATIC=[
 {path:'/for-venues',title:'Para recintos: recebe reservas sem custos · Jynlo',description:'Mostra os horários do teu recinto e recebe pedidos de reserva na Jynlo, sem custos nem comissões. Configura em minutos.',h1:'Para recintos'},
 {path:'/about',title:'Sobre a Jynlo',description:'A Jynlo ajuda-te a descobrir onde, quando e com quem jogar: recintos, jogos com vagas, comunidades e torneios.',h1:'Sobre a Jynlo'},
 {path:'/contact',title:'Contacto · Jynlo',description:'Fala com a equipa da Jynlo: dúvidas, sugestões ou parcerias com recintos.',h1:'Contacto'},
];

async function main(){
 for(const s of STATIC)page({...s,body:`<main class="prerender-page"><h1>${esc(s.h1)}</h1><p>${esc(s.description)}</p></main>`});
 let venues=[];
 try{
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),25000);
  const res=await fetch(`${API}/api/public/venues/prerender`,{signal:ctrl.signal,headers:{accept:'application/json'}});
  clearTimeout(timer);
  if(!res.ok)throw Error('HTTP '+res.status);
  venues=await res.json();
 }catch(e){
  console.warn('Páginas de recintos para o Google não geradas (API indisponível): '+(e?.message||e));
  return;
 }
 let n=0;
 for(const v of Array.isArray(venues)?venues:[]){
  if(!Number.isSafeInteger(v?.id)||v.id<=0||!v.name)continue;
  venuePage(v);n++;
 }
 const pairs=sportCityPairs(Array.isArray(venues)?venues.filter(v=>Number.isSafeInteger(v?.id)&&v.id>0&&v.name):[]);
 for(const p of pairs)sportCityPage(p,pairs);
 sportCityHub(pairs);
 console.log(`Páginas prontas para o Google: ${n} recintos, ${pairs.length} páginas de desporto e cidade e ${STATIC.length} páginas públicas.`);
}
await main();
