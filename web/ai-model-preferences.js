export const DEFAULT_CLAUDE_MODEL='claude-opus-5-5';
export const MODEL_PREFERENCES_KEY='vr-offerte-ai-models-v1';
const valid=value=>typeof value==='string'&&/^[-a-zA-Z0-9_.:]{1,100}$/.test(value);
export function loadModelPreferences(storage){
 const defaults={provider:'anthropic',models:{anthropic:DEFAULT_CLAUDE_MODEL,openai:''}};
 try{
  const value=JSON.parse(storage.getItem(MODEL_PREFERENCES_KEY)||'null');
  if(value?.version!==1)return defaults;
  return {provider:['anthropic','openai'].includes(value.provider)?value.provider:'anthropic',models:{anthropic:valid(value.models?.anthropic)?value.models.anthropic:DEFAULT_CLAUDE_MODEL,openai:valid(value.models?.openai)?value.models.openai:''}};
 }catch{return defaults;}
}
export function saveModelPreferences(storage,preferences){
 // Persist only provider and model IDs. Credentials and connection approvals are never copied.
 const value={version:1,provider:preferences.provider==='openai'?'openai':'anthropic',models:{anthropic:valid(preferences.models?.anthropic)?preferences.models.anthropic:DEFAULT_CLAUDE_MODEL,openai:valid(preferences.models?.openai)?preferences.models.openai:''}};
 try{storage.setItem(MODEL_PREFERENCES_KEY,JSON.stringify(value));return true;}catch{return false;}
}
export function rememberModel(preferences,provider,value){
 const model=typeof value==='string'?value.trim():'';
 if(!['anthropic','openai'].includes(provider))return false;
 if(model&&!valid(model))return false;
 preferences.provider=provider;preferences.models[provider]=model||(provider==='anthropic'?DEFAULT_CLAUDE_MODEL:'');return true;
}
