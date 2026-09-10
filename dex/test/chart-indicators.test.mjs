import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'app/chart-indicators.js'),'utf8');
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const indicators=sandbox.window.LQCChartIndicators;

describe('LQC chart indicator mathematics',function(){
  it('calculates a seeded exponential moving average deterministically',function(){
    const result=indicators.exponentialMovingAverage([{close:1},{close:2},{close:3}],2);
    assert.equal(result.length,2);assert.equal(result[0].index,1);assert.equal(result[0].value,1.5);assert.equal(result[1].value,2.5);
  });

  it('keeps constant-price Bollinger Bands collapsed at the same price',function(){
    const result=indicators.bollingerBands(Array.from({length:5},()=>({close:7})),3,2);
    assert.equal(result.length,3);for(const band of result){assert.equal(band.upper,7);assert.equal(band.middle,7);assert.equal(band.lower,7)}
  });

  it('produces finite Parabolic SAR points with explicit trend state',function(){
    const candles=Array.from({length:8},(_,index)=>({low:index+1,high:index+3,close:index+2.5}));
    const result=indicators.parabolicSar(candles);
    assert.equal(result.length,7);assert.ok(result.every(point=>Number.isFinite(point.value)&&typeof point.rising==='boolean'));
  });

  it('returns zero MACD on a flat market',function(){
    const result=indicators.macdSeries(Array.from({length:30},()=>({close:12})));
    assert.equal(result.length,30);assert.ok(result.every(item=>item.dif===0&&item.dea===0&&item.histogram===0));
  });

  it('centers KDJ at 50 when the trading range is flat',function(){
    const result=indicators.kdjSeries(Array.from({length:12},()=>({high:5,low:5,close:5})));
    assert.ok(result.every(item=>item.k===50&&item.d===50&&item.j===50));
  });

  it('fails closed for malformed values and unsafe parameters',function(){
    assert.throws(()=>indicators.bollingerBands([{close:NaN}],1),/malformed/);
    assert.throws(()=>indicators.macdSeries([{close:1}],26,12,9),/fast period/);
    assert.throws(()=>indicators.parabolicSar([{high:2,low:1,close:1.5},{high:3,low:2,close:2.5}],.3,.2),/acceleration/);
  });
});
