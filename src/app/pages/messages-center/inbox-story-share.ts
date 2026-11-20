/** Exact legacy Story shares from the Jynlo feed. Never turn arbitrary chat links into embeds. */
export function storyIdFromChatText(value:string|null|undefined):number|null {
  if(!value)return null;
  const lines=value.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.length===2&&lines[0]!=='❤️'&&lines[0]!=='♥️')return null;
  if(lines.length!==1&&lines.length!==2)return null;
  let url:URL;
  try {url=new URL(lines[lines.length-1]);}catch{return null;}
  if(url.origin!=='https://d24sports.com'||url.pathname!=='/menu/feed'
      ||url.hash||[...url.searchParams.keys()].some(key=>key!=='story'))return null;
  const id=url.searchParams.get('story');
  if(!id||!/^[1-9][0-9]{0,14}$/.test(id))return null;
  const parsed=Number(id);
  return Number.isSafeInteger(parsed)?parsed:null;
}
