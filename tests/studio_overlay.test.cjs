const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../controller/studio/Studio-NS6-UI.js'),'utf8');
function load(){
  const vals=new Map(), writes=[], pulses=[], focus=[], sort=[], logs=[];
  const engine={getValue:(g,k)=>vals.get(g+':'+k)??0,setValue:(g,k,v)=>{vals.set(g+':'+k,v);writes.push([g,k,v]);}};
  const n={isBooting:false,groupToDeck:{'[Channel1]':1,'[Channel2]':2,'[Channel3]':3,'[Channel4]':4},
    Decks:[null,...[1,2,3,4].map(i=>({shiftButton:{state:false},loadButton:{input(){throw Error('unpatched load');}}}))],
    Mixer:Object.fromEntries(['cratesButton','filesButton','viewButton','autoDjAddButton','navigationEncoderButton'].map(k=>[k,{input(){focus.push('original encoder');}}])),
    pressed:(v,s)=>(s&0xf0)!==0x80&&v>0,
    sortIfShifted:k=>{sort.push(k);return n.Decks.some(d=>d&&d.shiftButton.state);},
    focusLibraryWidget:v=>focus.push(v),toggleDeckLayout:()=>focus.push('layout'),
    pulse:(g,k)=>pulses.push([g,k]),init:()=>{}};
  const ctx={engine,NumarkNS6:n,print:v=>logs.push(v)};vm.createContext(ctx);vm.runInContext(src,ctx);
  const studio=ctx.StudioNS6;engine.setValue('[NS6Surface]','installed',1);studio.install();
  return {n,studio,engine,writes,pulses,focus,logs,sort};
}
test('CRATES and FILES open Browse and focus correct widgets',()=>{const {n,engine,focus}=load();n.Mixer.cratesButton.input(0,0,127,0x90);assert.equal(engine.getValue('[Skin]','show_maximized_library'),1);n.Mixer.filesButton.input(0,0,127,0x90);assert.deepEqual(focus,[2,3]);});
test('SHIFT preserves sorting without switching Browse',()=>{const {n,focus,sort,engine}=load();n.Decks[1].shiftButton.state=true;n.Mixer.filesButton.input(0,0,127,0x90);assert.deepEqual(sort,['BPM']);assert.deepEqual(focus,[]);assert.equal(engine.getValue('[Skin]','show_maximized_library'),0);});
test('VIEW returns from Browse before changing layout',()=>{const {n,engine,focus}=load();engine.setValue('[Skin]','show_maximized_library',1);n.Mixer.viewButton.input(0,0,127,0x90);assert.equal(engine.getValue('[Skin]','show_maximized_library'),0);assert.deepEqual(focus,[]);n.Mixer.viewButton.input(0,0,127,0x90);assert.deepEqual(focus,['layout']);});
test('LOAD PREPARE and shifted encoder preview, never AutoDJ',()=>{const {n,engine,pulses,writes}=load();n.Mixer.autoDjAddButton.input(0,0,127,0x90);n.Decks[2].shiftButton.state=true;engine.setValue('[PreviewDeck1]','play',1);n.Mixer.navigationEncoderButton.input(0,0,127,0x90);assert.deepEqual(pulses,[['[PreviewDeck1]','LoadSelectedTrackAndPlay'],['[PreviewDeck1]','stop']]);assert.ok(writes.every(x=>x[0]!=='[AutoDJ]'));});
test('ordinary encoder input delegated',()=>{const {n,focus}=load();n.Mixer.navigationEncoderButton.input(0,0,127,0x90);assert.deepEqual(focus,['original encoder']);});
test('LOAD only on addressed stopped deck, shift eject',()=>{const {n,pulses}=load();n.Decks[3].loadButton.input(3,0,127,0x93,'[Channel3]');n.Decks[3].shiftButton.state=true;n.Decks[3].loadButton.input(3,0,127,0x93,'[Channel3]');n.Decks[3].loadButton.input(3,0,127,0x93,'[Channel1]');n.Decks[3].loadButton.input(3,0,127,0x83,'[Channel3]');assert.deepEqual(pulses,[['[Channel3]','LoadSelectedTrack'],['[Channel3]','eject']]);});
test('busy deck protection rejects play, transport intent, jog, cue, handoff and boot',()=>{const {n,studio,engine,pulses}=load();const g='[Channel1]',d=n.Decks[1];for(const k of ['transportWantsPlay','jogTouched','cuePressed','scratchReleasePending','isAutoScrubbing']){d[k]=true;assert.equal(studio.load(g,d),false);d[k]=false;}engine.setValue(g,'play',1);assert.equal(studio.load(g,d),false);engine.setValue(g,'play',0);n.isBooting=true;assert.equal(studio.load(g,d),false);n.isBooting=false;assert.equal(studio.load('[Bad]',d),false);assert.deepEqual(pulses,[]);assert.equal(studio.load(g,d),true);});
