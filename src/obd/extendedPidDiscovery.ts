export type ExtendedService = '06' | '09';
export interface ExtendedCommandRecord { service: ExtendedService; command: string; response: string; status: 'RESPONDEU' | 'SEM_RESPOSTA' | 'ERRO'; elapsedMs: number; supportedIds: string[]; }
const BLOCKS = ['00','20','40','60','80','A0','C0','E0'];
function hex(raw: string): string { return raw.replace(/[^0-9A-F]/gi, '').toUpperCase(); }
export function decodeExtendedSupportBitmap(command: string, response: string, service: ExtendedService): string[] {
 const cmd=command.replace(/\s/g,'').toUpperCase();
 if(!new RegExp('^'+service+'(?:00|20|40|60|80|A0|C0|E0)$').test(cmd)) return [];
 const block=cmd.slice(-2), stream=hex(response), marker=(service==='06'?'46':'49')+block, offset=stream.indexOf(marker);
 if(offset<0)return [];
 const bitmap=stream.slice(offset+marker.length,offset+marker.length+8);
 if(!/^[0-9A-F]{8}$/.test(bitmap))return [];
 const start=parseInt(block,16)+1, result:string[]=[];
 for(let b=0;b<4;b++){const byte=parseInt(bitmap.slice(b*2,b*2+2),16);for(let bit=7;bit>=0;bit--){if(byte&(1<<bit)){const id=start+b*8+(7-bit);if(id<=start+31)result.push(id.toString(16).padStart(2,'0').toUpperCase());}}}
 return result;
}
export function nextExtendedSupportBlock(block:string,ids:string[]):string|null{const i=BLOCKS.indexOf(block);if(i<0||i>=BLOCKS.length-1)return null;return ids.includes(BLOCKS[i+1])?BLOCKS[i+1]:null;}
