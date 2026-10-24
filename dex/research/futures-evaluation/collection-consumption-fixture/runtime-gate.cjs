const path=require('node:path');
const {validateBuild}=require('./build-common.cjs');
module.exports=async function reviewedRuntime(){
 const verified=validateBuild(__dirname);
 const helper=await import(require('node:url').pathToFileURL(path.join(__dirname,'test/anvil-compat.mjs')).href);
 return {verified,helper};
};
