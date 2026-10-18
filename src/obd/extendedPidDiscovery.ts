export type ExtendedService = '06' | '09';
export interface ExtendedCommandResult { response: string; status: string; elapsedMs: number; }
export interface ExtendedCommandRecord { service: ExtendedService; command: string; response: string; status: 'RESPONDEU' | 'SEM_RESPOSTA' | 'ERRO'; elapsedMs: number; supportedIds: string[]; }
export interface ExtendedDiscoveryReport {
 schemaVersion: 1; source: 'REAL_OBD'; createdAt: string; protocol: string | null;
 policyId: 'MERIVA_EXTENDED_OBD_DISCOVERY_V1'; commands: ExtendedCommandRecord[];
 supportedMode09InfoTypes: string[]; supportedMode06MonitorIds: string[]; skippedCommands: string[]; notes: string[];
}
export interface ExtendedCommandSession {
 executeCommand(command: string): Promise<ExtendedCommandResult>;
 withExclusiveCommandSession?<T>(operation: (executeCommand: (command: string) => Promise<ExtendedCommandResult>) => Promise<T>): Promise<T>;
}
const BLOCKS = ['00','20','40','60','80','A0','C0','E0'];
const SAFE_MODE09_TYPES = ['01','03','04','05','06','07','0A'];
function hex(raw: string): string { return raw.replace(/[^0-9A-F]/gi, '').toUpperCase(); }
function hasPositive(raw: string, service: string, id: string): boolean { return hex(raw).includes(service + id); }

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

async function queryBitmaps(executeCommand:(command:string)=>Promise<ExtendedCommandResult>,service:ExtendedService,records:ExtendedCommandRecord[]):Promise<string[]>{
 const all=new Set<string>();let block:string|null='00';
 while(block){
  const command=service+block,started=Date.now();
  try{
   const r=await executeCommand(command),ids=decodeExtendedSupportBitmap(command,r.response,service);
   const ok=r.status==='OK'&&hasPositive(r.response,service==='06'?'46':'49',block);
   records.push({service,command,response:r.response,status:ok?'RESPONDEU':'SEM_RESPOSTA',elapsedMs:r.elapsedMs||Date.now()-started,supportedIds:ids});
   ids.forEach(id=>all.add(id));block=ok?nextExtendedSupportBlock(block,ids):null;
  }catch{records.push({service,command,response:'',status:'ERRO',elapsedMs:Date.now()-started,supportedIds:[]});block=null;}
 }
 return Array.from(all).sort((a,b)=>parseInt(a,16)-parseInt(b,16));
}
async function runDiscovery(executeCommand:(command:string)=>Promise<ExtendedCommandResult>,protocol:string|null):Promise<ExtendedDiscoveryReport>{
 const commands:ExtendedCommandRecord[]=[];
 const supportedMode09InfoTypes=await queryBitmaps(executeCommand,'09',commands);
 const supportedMode06MonitorIds=await queryBitmaps(executeCommand,'06',commands);
 for(const id of SAFE_MODE09_TYPES){
  if(!supportedMode09InfoTypes.includes(id))continue;
  const command='09'+id,started=Date.now();
  try{const r=await executeCommand(command),ok=r.status==='OK'&&hasPositive(r.response,'49',id);
   commands.push({service:'09',command,response:r.response,status:ok?'RESPONDEU':'SEM_RESPOSTA',elapsedMs:r.elapsedMs||Date.now()-started,supportedIds:[]});
  }catch{commands.push({service:'09',command,response:'',status:'ERRO',elapsedMs:Date.now()-started,supportedIds:[]});}
 }
 return {schemaVersion:1,source:'REAL_OBD',createdAt:new Date().toISOString(),protocol,policyId:'MERIVA_EXTENDED_OBD_DISCOVERY_V1',commands,supportedMode09InfoTypes,supportedMode06MonitorIds,skippedCommands:['0902'],notes:['Todas as consultas são sequenciais. Quando disponível, a fila serial é reservada durante a rotina inteira para impedir interleaving com telemetria.','Mode 06 registra bitmaps; resultados individuais aguardam parser validado.','Comando 0902 omitido por política de privacidade.','Ausência de resposta não comprova defeito físico.']};
}
/** Prefere reservar a fila do ELM durante toda a descoberta para evitar interleaving com telemetria. */
export async function discoverExtendedObdData(session:ExtendedCommandSession,protocol:string|null=null):Promise<ExtendedDiscoveryReport>{
 if(session.withExclusiveCommandSession) return session.withExclusiveCommandSession(executeCommand=>runDiscovery(executeCommand,protocol));
 return runDiscovery(command=>session.executeCommand(command),protocol);
}
