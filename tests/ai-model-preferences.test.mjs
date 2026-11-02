import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CLAUDE_MODEL,MODEL_PREFERENCES_KEY,loadModelPreferences,saveModelPreferences,rememberModel} from '../web/ai-model-preferences.js';
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values};};
test('empty or unavailable browser storage always supplies the requested Claude default',()=>{
 for(const s of [storage(),undefined,{getItem(){throw Error('blocked');}}])assert.deepEqual(loadModelPreferences(s),{provider:'anthropic',models:{anthropic:'claude-opus-5-5',openai:''}});
});
test('model changes survive fresh loading and switching providers keeps each model',()=>{
 const s=storage(),p=loadModelPreferences(s);rememberModel(p,'anthropic','custom-claude-model');saveModelPreferences(s,p);
 let fresh=loadModelPreferences(s);assert.equal(fresh.models.anthropic,'custom-claude-model');rememberModel(fresh,'openai','custom-openai-model');saveModelPreferences(s,fresh);
 fresh=loadModelPreferences(s);assert.equal(fresh.provider,'openai');assert.equal(fresh.models.anthropic,'custom-claude-model');assert.equal(fresh.models.openai,'custom-openai-model');
 rememberModel(fresh,'anthropic','');saveModelPreferences(s,fresh);assert.equal(loadModelPreferences(s).models.anthropic,DEFAULT_CLAUDE_MODEL);
});
test('invalid or corrupt preferences fall back safely and unrelated credentials are not persisted',()=>{
 const s=storage();s.setItem(MODEL_PREFERENCES_KEY,'broken json');assert.equal(loadModelPreferences(s).models.anthropic,DEFAULT_CLAUDE_MODEL);
 s.setItem(MODEL_PREFERENCES_KEY,JSON.stringify({version:1,provider:'evil',models:{anthropic:'<script>',openai:22}}));assert.equal(loadModelPreferences(s).provider,'anthropic');assert.equal(loadModelPreferences(s).models.anthropic,DEFAULT_CLAUDE_MODEL);
 const p={...loadModelPreferences(s),apiKey:'test-secret',consent:true,tested:true};saveModelPreferences(s,p);assert.ok(!s.getItem(MODEL_PREFERENCES_KEY).includes('test-secret'));assert.deepEqual(Object.keys(JSON.parse(s.getItem(MODEL_PREFERENCES_KEY))),['version','provider','models']);assert.equal(rememberModel(p,'anthropic','invalid model with spaces'),false);
 assert.equal(saveModelPreferences({setItem(){throw Error('full');}},p),false);
});
