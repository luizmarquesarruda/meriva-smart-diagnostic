import { parsePidResponse } from './parser';
export interface ObdTransport { open(): Promise<void>; close(): Promise<void>; write(data: string): Promise<void>; readUntilPrompt(timeoutMs?: number): Promise<string>; }
export type ElmCommandStatus = 'OK' | 'TIMEOUT' | 'ERROR' | 'NO_RESPONSE';
export interface ElmCommandResult { command: string; response: string; elapsedMs: number; status: ElmCommandStatus; attempt: number; errorMessage?: string; }
export interface PidQueryResult { tx: string; rx: string; elapsedMs: number; commandStatus: ElmCommandStatus; parsed: ReturnType<typeof parsePidResponse>; }
const NEGATIVE_RESPONSES = ['ERROR', 'NO DATA', 'UNABLE TO CONNECT', 'STOPPED', "CAN'T CONNECT", 'BUS INIT'];
function responseHasNegative(response: string) { const n = response.toUpperCase(); return NEGATIVE_RESPONSES.some((t) => n.includes(t)); }
function responseLooksLikeElm(response: string) { const n = response.toUpperCase(); return n.includes('ELM') || n.includes('OBD'); }
function responseLooksLikeObd(response: string) { return /\b(41|43|48|49|4A|4B|4C|4D|4E|4F)\b/i.test(response); }
export class Elm327Session {
  private opened=false; private initializing=false; private initialized=false; private ecuReady=false;
  constructor(private readonly transport: ObdTransport) {}
  get isInitialized(){return this.initialized;} get isEcuReady(){return this.ecuReady;}
  async initialize(): Promise<ElmCommandResult[]> {
    if (this.initializing) throw new Error('INICIALIZAÇÃO ELM JÁ EM ANDAMENTO'); this.initializing=true;
    try {
      await this.transport.open(); this.opened=true; const results: ElmCommandResult[]=[];
      const identity=await this.command('ATI'); results.push(identity);
      if(identity.status!=='OK'||!responseLooksLikeElm(identity.response)) throw new Error('ELM327 NÃO RESPONDEU AO ATI: '+(identity.response||identity.status));
      for(const command of ['ATZ','ATE0','ATL0','ATS0','ATH1','ATSP0']){const result=await this.command(command);results.push(result);if(result.status!=='OK')throw new Error('ELM NÃO ACEITOU '+command+': '+result.status);}
      this.initialized=true; return results;
    } catch(cause){this.initialized=false;this.ecuReady=false;this.opened=false;try{await this.transport.close();}catch{}throw cause;} finally{this.initializing=false;}
  }
  async confirmEcu(): Promise<ElmCommandResult> {
    if(!this.opened||!this.initialized) throw new Error('ELM327 AINDA NÃO FOI INICIALIZADO');
    const result=await this.command('0100');
    if(result.status!=='OK'||responseHasNegative(result.response)||!responseLooksLikeObd(result.response)){this.ecuReady=false;throw new Error('ECU NÃO RESPONDEU: '+(result.response||result.status));}
    this.ecuReady=true; return result;
  }
  async queryPid(pid:string):Promise<PidQueryResult>{
    if(!this.opened||!this.initialized||!this.ecuReady) throw new Error('DIAGNÓSTICO NÃO PRONTO: BLUETOOTH → ELM327 → ECU DEVEM ESTAR CONFIRMADOS');
    const normalized=pid.replace(/\s/g,'').toUpperCase(); const result=await this.command(normalized); const parsed=parsePidResponse(normalized,result.response);
    return {tx:normalized,rx:result.response,elapsedMs:result.elapsedMs,commandStatus:result.status,parsed};
  }
  async close():Promise<void>{this.initialized=false;this.ecuReady=false;this.opened=false;try{await this.transport.close();}finally{}}
  private async command(command:string,attempt=1):Promise<ElmCommandResult>{
    const started=Date.now();
    try{await this.transport.write(command+'\r');const response=await this.transport.readUntilPrompt();if(!response.trim())return{command,response:'',elapsedMs:Date.now()-started,status:'NO_RESPONSE',attempt};if(responseHasNegative(response))return{command,response,elapsedMs:Date.now()-started,status:'ERROR',attempt,errorMessage:response.trim()};return{command,response,elapsedMs:Date.now()-started,status:'OK',attempt};}
    catch(cause){const errorMessage=cause instanceof Error?cause.message:'ERRO DESCONHECIDO';return{command,response:'',elapsedMs:Date.now()-started,status:errorMessage.includes('TIMEOUT')?'TIMEOUT':'ERROR',attempt,errorMessage};}
  }
}
