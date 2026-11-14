import {copyFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const source=resolve('src/app-download.html');
const approvedSplash=resolve('dist/desporto24/assets/jynlo-splash-approved.webp');
const destination=resolve('dist/desporto24/app/index.html');
const html=readFileSync(source,'utf8');
if(!existsSync(approvedSplash))throw Error('Imagem aprovada da Jynlo não está incluída na build.');
if(!html.includes('https://d24sports.com/assets/jynlo-splash-approved.webp') ||
   !html.includes('https://d24sports.com/app/'))
 throw Error('A página de instalação precisa dos metadados oficiais da Jynlo.');
mkdirSync(resolve('dist/desporto24/app'),{recursive:true});
copyFileSync(source,destination);
console.log('Página pública de instalação Jynlo incluída em /app/');
