import {writeFile} from 'node:fs/promises';
import {INSTALLATION_PRODUCTS} from '../web/installation-catalog.js';
const keys=['code','group','name','category','unit','cost','priceType','brand','manufacturerCode','ean','series','discipline','listPrice','packQty','sourceId','sourceRow','sourceDate','priceDate'];
const q=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
await writeFile(new URL('../web/installatiecatalogus.csv',import.meta.url),'\uFEFF'+keys.join(';')+'\r\n'+INSTALLATION_PRODUCTS.map(p=>keys.map(k=>q(p[k])).join(';')).join('\r\n')+'\r\n');
console.log(INSTALLATION_PRODUCTS.length+' catalogue rows exported.');
