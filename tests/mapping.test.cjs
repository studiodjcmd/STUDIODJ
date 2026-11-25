// Mocked Mixxx globals: not hardware certification.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../controller/baseline/Numark-NS6-Original.js'),'utf8');
function load(settings={}) {
  const values=new Map(), messages=[];
  const engine={getSetting:k=>settings[k],getValue:(g,k)=>values.get(g+':'+k)??0,setValue:(g,k,v)=>values.set(g+':'+k,v),makeConnection:()=>({})};
  const ctx={engine,components:{Encoder:function(){},ComponentContainer:function(){},Component:function(){},Deck:function(){}},midi:{sendShortMsg:(...a)=>messages.push(a)},print:()=>{}};
  vm.createContext(ctx); vm.runInContext(src,ctx);
  return {n:ctx.NumarkNS6,engine,messages};
}
test('deck numbering and layer defaults',()=>{const {n}=load(); assert.equal(n.leftDeck,1); assert.equal(n.rightDeck,2); for(let i=1;i<=4;i++) assert.equal(n.groupToDeck['[Channel'+i+']'],i);});
test('fine pitch',()=>{const {n}=load(); assert.equal(n.finePitchParameterStep(.5,undefined,.9,.25),.5); assert.equal(n.finePitchParameterStep(.5,.2,.6,.25),.6); assert.equal(n.finePitchParameterStep(.99,0,1,.25),1); assert.equal(n.finePitchParameterStep(.01,1,0,.25),0);});
test('original pitch LED protocol',()=>{const {n}=load(); assert.equal(n.pitchTakeoverLED.UP,0x3c); assert.equal(n.pitchTakeoverLED.DOWN,0x3d); assert.equal(n.pitchSyncArrowValues(155,155).up,0); assert.equal(n.pitchSyncArrowValues(155,156).down,127); assert.equal(n.pitchSyncArrowValues(156,155).up,127);});
test('skin route',()=>{const {n,engine}=load({traktmixxxRaw:true}); assert.equal(n.skinKeys().library[0],'[Master]'); engine.setValue('[NS6Surface]','installed',1); assert.equal(n.skinKeys().library[0],'[Skin]'); assert.equal(n.skinKeys().decks[1],'show_4decks');});
test('layer feedback and LEDs',()=>{const {n,engine,messages}=load(); engine.setValue('[NS6Surface]','installed',1); n.leftDeck=3;n.rightDeck=4;n.syncLayerLEDs(); assert.equal(engine.getValue('[NS6Surface]','left_alt'),1);assert.equal(engine.getValue('[NS6Surface]','right_alt'),1);assert.deepEqual(messages,[[0xb0,0x50,127],[0xb0,0x51,127]]);});
test('existing exclusive PFL',()=>{const {n,engine}=load();n.setPFL(1,true);n.setPFL(2,true);assert.equal(engine.getValue('[Channel1]','pfl'),0);assert.equal(engine.getValue('[Channel2]','pfl'),1);n.setPFL(2,false);assert.equal(engine.getValue('[Channel2]','pfl'),0);});
