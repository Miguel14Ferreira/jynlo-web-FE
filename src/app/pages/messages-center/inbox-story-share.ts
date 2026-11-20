/** Recognize only official Jynlo Story shares, including a short accompanying caption. */
export interface StoryChatShare { id:number; caption:string; }
export function storyShareFromChatText(value:string|null|undefined):StoryChatShare|null {
  if(!value||value.length>600)return null;
  const lines=value.trim().split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.length<1||lines.length>4)return null;
  let url:URL;
  try {url=new URL(lines[lines.length-1]);}catch{return null;}
  if(url.origin!=='https://d24sports.com'||url.pathname!=='/menu/feed'
      ||url.hash||[...url.searchParams.keys()].some(key=>key!=='story'))return null;
  const id=url.searchParams.get('story');
  if(url.searchParams.getAll('story').length!==1||!id||!/^[1-9][0-9]{0,14}$/.test(id))return null;
  const parsed=Number(id);
  if(!Number.isSafeInteger(parsed))return null;
  const words=lines.slice(0,-1).filter(line=>line!=='❤️'&&line!=='♥️');
  const caption=words.join('\n');
  if(caption.length>280||/https?:\/\//i.test(caption))return null;
  return {id:parsed,caption};
}
export function storyIdFromChatText(value:string|null|undefined):number|null {
  return storyShareFromChatText(value)?.id??null;
}
