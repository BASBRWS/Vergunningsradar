export function connectionState(apiBase,token){
 if(!apiBase)return {ready:false,code:'no_server',message:'AI is nog niet aangesloten. Voor deze demo is geen AI serveradres ingesteld. Je kunt de begeleide intake wel gebruiken. Een AI server, API sleutel en model moeten eerst worden aangesloten.'};
 if(!token)return {ready:false,code:'login',message:'Er is een serveradres ingesteld. Log eerst in via Vergunningradar om de AI verbinding te controleren.'};
 return {ready:true,code:'unchecked',message:'Serveradres en inlogsessie zijn aanwezig. De AI dienst is nog niet getest.'};
}
export function friendlyConnectionError(error){
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'De server of AI dienst reageerde niet op tijd. Je gesprek is bewaard. Probeer de verbinding later opnieuw.';
 if(error instanceof TypeError)return 'De browser bereikt de AI server niet. Controleer het serveradres, HTTPS en of deze website toegang heeft tot de server.';
 return error?.message||'De AI verbinding kon niet worden gecontroleerd.';
}
