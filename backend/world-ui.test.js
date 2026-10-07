const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const LittleWorld=require('../frontend/little-world');
function fixture(){
  const ids={};
  class Node{
    constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.attrs={};this.events={};this.offsetWidth=44;this.offsetHeight=44;this.value='';this.open=false;}
    set id(value){ids[value]=this;} append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
    appendChild(node){this.append(node);} setAttribute(key,value){this.attrs[key]=value;} addEventListener(key,fn){this.events[key]=fn;}
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);} showModal(){this.open=true;}close(){this.open=false;}
    focus(){}blur(){}setPointerCapture(){}getBoundingClientRect(){return {width:400,height:300,left:0,top:0};}
  }
  const document={body:new Node('body'),createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),getElementById:id=>ids[id]};ids.iconMenu=new Node('menu');
  const calls=[];const context=vm.createContext({LittleWorld,document,window:{addEventListener(){}},currentUsername:'Alice',localPreview:false,
    crypto:{randomUUID:()=> 'new-text'},closeIconMenu(){},closeMessageMenu(){},scheduleReadReceipts(){},
    socket:{connected:true,timeout(){return this;},emit(event,data,ack){calls.push({event,data,ack});}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/world-ui.js'),'utf8'),context);
  return {ids,context,calls,ui:vm.runInContext('WorldUI',context),menu:ids.iconMenu.children[0]};
}
const piece={id:'moon',owner:'Alice',type:'moon',x:20,y:20};
const nodes=node=>[node,...(node.children||[]).flatMap(nodes)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function loaded(){const f=fixture();f.menu.onclick();f.calls[0].ack(null,{ok:true,world:{items:[piece],revision:1}});await flush();return f;}

test('dragging stays local until drop, remote updates merge, and stale snapshots cannot rewind the world',async()=>{
  const f=await loaded(),node=f.ids.worldScene.children[0];
  node.onpointerdown({button:0,pointerId:1});node.onpointermove({pointerId:1,clientX:200,clientY:150});
  assert.equal(f.calls.length,1);
  f.ui.apply({items:[piece,{id:'star',owner:'Bob',type:'stars',x:70,y:20}],revision:2});
  assert.equal(f.ids.worldScene.children.length,1);
  node.onpointerup({pointerId:1});
  assert.equal(f.calls[1].event,'change world');assert.equal(f.calls[1].data.x,50);assert.equal(f.calls[1].data.y,50);
  assert.equal(f.ids.worldScene.children.length,2);
  f.calls[1].ack(null,{ok:true,world:{items:[{...piece,x:50,y:50},{id:'star',owner:'Bob',type:'stars',x:70,y:20}],revision:3}});await flush();
  f.ui.apply({items:[],revision:1});assert.equal(f.ids.worldScene.children.length,2);
});

test('canceled dragging restores coordinates and logout invalidates outstanding saves',async()=>{
  const f=await loaded(),node=f.ids.worldScene.children[0];
  node.onpointerdown({button:0,pointerId:1});node.onpointermove({pointerId:1,clientX:200,clientY:150});node.onpointercancel();
  assert.equal(f.calls.length,1);assert.match(node.style.left,/20%/);
  node.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(f.calls[1].data.x,22);
  f.ui.reset();f.context.currentUsername=null;
  f.calls[1].ack(null,{ok:true,world:{items:[{...piece,x:22}],revision:2}});await flush();
  assert.equal(f.ids.worldScene.children.length,0);assert.equal(f.ids.worldDialog.open,false);
});

test('text uses safe text content, ownership blocks other-user controls and preview impersonation is disabled live',async()=>{
  const f=await loaded();
  const addText=nodes(f.ids.worldDialog).find(node=>node.attrs?.['aria-label']==='Add Text');addText.onclick();
  f.ids.worldTextInput.value='<img src=x onerror=bad>';
  f.ids.worldScene.onclick({target:f.ids.worldScene,clientX:200,clientY:150});
  assert.equal(f.calls[1].data.type,'text');assert.equal(f.calls[1].data.owner,undefined);
  f.calls[1].ack(null,{ok:true,world:{items:[piece,{id:'new-text',type:'text',owner:'Alice',text:'<img src=x onerror=bad>',x:50,y:50}],revision:2}});await flush();
  assert.equal(f.ids.worldScene.children[1].textContent,'<img src=x onerror=bad>');assert.equal(f.ids.worldScene.children[1].children.length,0);
  f.ui.apply({items:[{...piece,owner:'Bob'}],revision:3});f.ui.previewAs('Bob');
  const node=f.ids.worldScene.children[0];node.onpointerdown({button:0,pointerId:3});node.onpointermove({pointerId:3,clientX:50,clientY:50});node.onpointerup({pointerId:3});
  assert.equal(f.calls.length,2);
});
