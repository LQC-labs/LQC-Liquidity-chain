(function(root){
  'use strict';
  const storageKey='lqc-flow-language',fallback='en',supported=()=>Object.keys(root.LQCLocales||{});
  function normalize(value){return String(value||'').trim().toLowerCase().split('-')[0]}
  function detect(){let saved='';try{saved=localStorage.getItem(storageKey)||''}catch{}const candidates=[saved,...(navigator.languages||[]),navigator.language,fallback].map(normalize);return candidates.find(code=>supported().includes(code))||fallback}
  function translate(key,locale=current){return root.LQCLocales?.[locale]?.[key]??root.LQCLocales?.[fallback]?.[key]??key}
  function apply(locale){if(!supported().includes(locale))locale=fallback;current=locale;document.documentElement.lang=locale;document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=translate(node.dataset.i18n,locale)});document.querySelectorAll('[data-i18n-placeholder]').forEach(node=>{node.placeholder=translate(node.dataset.i18nPlaceholder,locale)});document.querySelectorAll('[data-i18n-aria-label]').forEach(node=>{node.setAttribute('aria-label',translate(node.dataset.i18nAriaLabel,locale))});const selector=document.getElementById('languageSelect');if(selector)selector.value=locale;return locale}
  function setLocale(locale){locale=normalize(locale);if(!supported().includes(locale))locale=fallback;try{localStorage.setItem(storageKey,locale)}catch{}apply(locale);root.dispatchEvent(new CustomEvent('lqc:languagechange',{detail:{locale}}));return locale}
  let current=detect();
  function init(){apply(current);const selector=document.getElementById('languageSelect');if(selector)selector.addEventListener('change',event=>setLocale(event.target.value))}
  root.LQCI18n=Object.freeze({init,setLocale,t:translate,get locale(){return current},supportedLocales:supported});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window==='undefined'?globalThis:window);
