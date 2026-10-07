const WorldUI = (() => {
  const {World,decorations,validText}=LittleWorld;
  let world=new World(),saved={items:[],revision:0},revision=-1,pending=null,session=0,busy=false,loading=false;
  let previewActor=null,actor='',selected=null,placing='stars',drag=null;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  const dialog = make('dialog'); dialog.id = 'worldDialog'; dialog.setAttribute('aria-labelledby', 'worldTitle');
  const heading = make('header'), title = make('h2', 'Our little world 🌙'); title.id = 'worldTitle';
  const close = make('button', 'Close'); close.type = 'button'; heading.append(title, close);
  dialog.append(heading, make('p', 'A little place for both of you. Add decorations and notes; only their owner can move or remove them.'));
  const controls=make('div','','world-preview-controls');
  const refresh=make('button','Refresh');refresh.type='button';refresh.onclick=()=>load();controls.appendChild(refresh);dialog.appendChild(controls);
  const palette = make('div', '', 'world-palette'); palette.setAttribute('role','group'); palette.setAttribute('aria-label','Choose a decoration');
  const paletteButtons = new Map();
  for (const [type, [emoji, name]] of Object.entries(decorations)) {
    const button = make('button'); button.type = 'button'; button.append(make('span',emoji), document.createTextNode(name));
    button.setAttribute('aria-label','Add '+name); button.onclick = () => { cancelDrag(); placing=type; selected=null; render(); if(type==='text')textInput.focus(); };
    paletteButtons.set(type,button); palette.appendChild(button);
  }
  dialog.appendChild(palette);
  const textEditor=make('div');textEditor.id='worldTextEditor';textEditor.hidden=true;
  const textLabel=make('label','Your text (up to 80 characters)');textLabel.htmlFor='worldTextInput';
  const textInput=make('input');textInput.id='worldTextInput';textInput.type='text';textInput.maxLength=80;
  textInput.placeholder='Write a little note…';textInput.autocomplete='off';
  textInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();textInput.blur();scene.focus();}});
  textEditor.append(textLabel,textInput);dialog.appendChild(textEditor);
  const scene = make('div'); scene.id='worldScene'; scene.tabIndex=0; scene.setAttribute('role','group'); scene.setAttribute('aria-label','Shared night scene. Choose a decoration and tap to place it, or press Enter to place it in the center.');
  dialog.appendChild(scene);
  const footer=make('div','','world-bottom'), details=make('p');details.id='worldDetails';
  const remove=make('button','Remove');remove.type='button';footer.append(details,remove);dialog.appendChild(footer);
  const status=make('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.appendChild(status);
  dialog.appendChild(make('p','Tap a piece to see who added it. Drag your own pieces, or focus one and use arrow keys. Text and decorations share a maximum of 30 pieces.'));
  document.body.appendChild(dialog);
  const pieces=new Map();
  function apply(data) {
    if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.revision) || data.revision < revision) return;
    if (drag) { if (!pending || data.revision >= pending.revision) pending=data; return; }
    revision=data.revision;
    saved={items:new World(data.items).items,revision};
    world=new World(saved.items);render();
  }
  function consumePending() { if(pending){const value=pending;pending=null;apply(value);} }
  function request(connection,event,data) {
    return new Promise((resolve,reject)=>connection.timeout(15000).emit(event,data,(error,result)=>{
      if(error||!result?.ok)reject(new Error('World request failed'));else resolve(result.world);
    }));
  }
  async function load() {
    if(busy||loading||!socket?.connected||!currentUsername)return;
    const connection=socket,token=session;actor=localPreview&&previewActor?previewActor:currentUsername;loading=true;render();status.textContent='Loading your world…';
    try { const result=await request(connection,'get world',{});if(connection!==socket||token!==session)return;apply(result);status.textContent=localPreview?'Offline sample world':'Shared world is up to date'; }
    catch {if(token===session)status.textContent='Could not load your world. Tap Refresh to retry.';}
    finally {if(token===session){loading=false;render();}}
  }
  async function change(data) {
    if(busy||loading||!socket?.connected){status.textContent='Reconnect or wait for the current update, then try again.';world=new World(saved.items);render();return false;}
    const connection=socket,token=session;busy=true;render();status.textContent='Saving…';
    try {const result=await request(connection,'change world',data);if(connection!==socket||token!==session)return false;apply(result);status.textContent=localPreview?'Saved in offline preview':'Saved for both of you';return true;}
    catch {if(token===session){world=new World(saved.items);status.textContent='Could not confirm the change. Refresh before trying again. The world may be full or the piece unavailable.';}return false;}
    finally {if(token===session){busy=false;render();}}
  }
  function coords(event) {
    const rect=scene.getBoundingClientRect();
    return { x:Math.max(22,Math.min(rect.width-22,event.clientX-rect.left))/rect.width*100,
      y:Math.max(22,Math.min(rect.height-22,event.clientY-rect.top))/rect.height*100 };
  }
  async function place(x,y) {
    if (!placing || busy || loading) return;
    if(placing==='text'&&!validText(textInput.value)){status.textContent='Type a note of 1–80 characters, then tap the scene.';textInput.focus();return;}
    if(world.items.length>=30){status.textContent='Your world has 30 pieces. Remove one of your pieces first.';return;}
    const id=crypto.randomUUID(),type=placing;
    const ok=await change({action:'add',id,type,x,y,...(type==='text'?{text:textInput.value.trim()}: {})});
    if(ok){if(type==='text'){textInput.blur();textInput.value='';}selected=id;placing=null;render();}
  }
  function cancelDrag() {
    if (!drag) return;
    world.move(drag.id,actor,drag.x,drag.y);drag=null;consumePending();render();
  }
  function render() {
    for (const [id,node] of pieces) if (!world.items.some(item=>item.id===id)) {node.remove();pieces.delete(id);}
    for (const item of world.items) {
      let node=pieces.get(item.id);
      if (!node) {
        node=make('button',item.type==='text'?item.text:decorations[item.type][0],item.type==='text'?'world-piece world-text':'world-piece');node.type='button';
        pieces.set(item.id,node);scene.appendChild(node);
      }
        node.onclick=event=>{event.stopPropagation();selected=item.id;placing=null;render();};
        node.onpointerdown=event=>{
          if (event.button!==0 || drag || busy || loading || !socket?.connected) return;
          selected=item.id;placing=null;render();
          if(item.owner!==actor){status.textContent='Added by '+item.owner+'. Only '+item.owner+' can move or remove this piece.';return;}
          drag={id:item.id,pointer:event.pointerId,x:item.x,y:item.y};node.setPointerCapture(event.pointerId);
        };
        node.onpointermove=event=>{if(!drag||drag.id!==item.id||drag.pointer!==event.pointerId)return;const point=coords(event);world.move(item.id,actor,point.x,point.y);render();};
        node.onpointerup=event=>{if(!drag||drag.id!==item.id||drag.pointer!==event.pointerId)return;const payload={action:'move',id:item.id,x:item.x,y:item.y};const moved=item.x!==drag.x||item.y!==drag.y;drag=null;consumePending();if(moved)change(payload);};
        node.onpointercancel=cancelDrag;
        node.onlostpointercapture=cancelDrag;
        node.onkeydown=event=>{
          const delta={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[event.key];
          if(!delta)return;event.preventDefault();if(busy||loading)return;
          if(item.owner===actor){selected=item.id;change({action:'move',id:item.id,x:LittleWorld.clamp(item.x+delta[0]),y:LittleWorld.clamp(item.y+delta[1])});}
          else status.textContent='Only '+item.owner+' can move this piece.';
        };
      const halfWidth=Math.max(22,node.offsetWidth/2),halfHeight=Math.max(22,node.offsetHeight/2);
      node.style.left='clamp('+halfWidth+'px, '+item.x+'%, calc(100% - '+halfWidth+'px))';node.style.top='clamp('+halfHeight+'px, '+item.y+'%, calc(100% - '+halfHeight+'px))';
      node.dataset.selected=String(selected===item.id);
      node.setAttribute('aria-label',(item.type==='text'?'Text: '+item.text:decorations[item.type][1])+' · added by '+item.owner+(item.owner===actor?'. Drag or use arrow keys to move.':'. View only.'));
    }
    textEditor.hidden=placing!=='text';
    for(const[type,button]of paletteButtons){button.setAttribute('aria-pressed',String(placing===type));button.disabled=busy||loading;}
    refresh.disabled=busy||loading;
    const chosen=world.items.find(item=>item.id===selected);
    details.textContent=chosen?decorations[chosen.type][1]+' · added by '+chosen.owner:placing?(placing==='text'?'Type a note, then tap the scene':'Tap the scene to add '+decorations[placing][1].toLowerCase()):'Choose a decoration';
    remove.disabled=busy||loading||!chosen||chosen.owner!==actor;
  }
  scene.onclick=event=>{if(event.target===scene){const point=coords(event);place(point.x,point.y);}};
  scene.onkeydown=event=>{if(event.target===scene&&(event.key==='Enter'||event.key===' ')){event.preventDefault();place(50,50);}};
  remove.onclick=async()=>{cancelDrag();const id=selected;if(id&&await change({action:'remove',id})){selected=null;render();}};
  close.onclick=()=>{cancelDrag();dialog.close();scheduleReadReceipts();};dialog.addEventListener('cancel',()=>{cancelDrag();scheduleReadReceipts();});
  const menuButton=make('button','Our little world 🌙');menuButton.type='button';menuButton.setAttribute('aria-haspopup','dialog');
  menuButton.onclick=()=>{closeIconMenu();closeMessageMenu();actor=localPreview&&previewActor?previewActor:currentUsername;dialog.showModal();render();load();};document.getElementById('iconMenu').appendChild(menuButton);
  function reset() {
    ++session;drag=null;pending=null;busy=false;loading=false;revision=-1;saved={items:[],revision:0};world=new World();selected=null;placing='stars';textInput.value='';
    if(dialog.open)dialog.close();for(const node of pieces.values())node.remove();pieces.clear();status.textContent='';
  }
  function disconnect(){++session;cancelDrag();busy=false;loading=false;world=new World(saved.items);render();status.textContent='Reconnecting… refresh the world when connected.';}
  window.addEventListener('resize',()=>{if(dialog.open)render();});
  function previewAs(username){if(!localPreview)return;cancelDrag();previewActor=username;actor=username;selected=null;render();}
  return {apply,reset,disconnect,load,previewAs};
})();
