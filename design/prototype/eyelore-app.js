(function(){
const E=window.EYE;
const TX=2520,TW=760,TY=840;
const EDIT={x:2720,y:110,w:360,h:640,r:28},THEATER={x:2560,y:90,w:680,h:680,r:340};
const BX=330,BY0=1440,ROWH=430,CW=180,CH=320,GAP=64,GX=1720;
const VIEW={idea:{x:40,y:30,w:1480,h:950},edit:{x:2390,y:50,w:1390,h:960},theater:{x:2420,y:20,w:960,h:820}};
const DROPGLOW='0 0 0 2px rgba(61,123,242,.65), 0 0 46px 12px rgba(61,123,242,.36)';
const BASESH='0 1px 2px rgba(26,26,26,.14), 0 22px 54px rgba(26,26,26,.16)';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=t=>{t=Math.max(0,t);const m=Math.floor(t/60),s=(t%60).toFixed(1);return m+':'+(s<10?'0':'')+s};

function initState(){
 const clips=E.initClips();
 return {ready:true,mode:'idea',cam:{x:0,y:0,z:.8},camAnim:false,heroInstant:false,vw:1200,vh:800,
 clips,rows:E.initRows(),active:'c1',free:[{id:'f1',clip:'c20',x:3610,y:120,w:150,h:267,fresh:false}],
 t:4.3,playing:false,loop:null,momentsOnly:false,
 labels:{'clip:c5':['#hook'],'clip:c1':['#demo'],'clip:c6':['#cta'],'clip:c11':['#hook'],'clip:c10':['#demo'],'clip:c7':['#hook'],'clip:c20':['real phone clip']},
 labelEdit:null,menu:null,hover:null,exp:null,talk:null,wave:Array(34).fill(.06),
 takes:[{id:'k4',name:'Take 4 · warmer',f:'sepia(.18) saturate(1.2) brightness(1.04)'},{id:'k3',name:'Take 3 · tighter',f:'contrast(1.1) saturate(1.05)'},{id:'k2',name:'Take 2 · cooler',f:'hue-rotate(12deg) saturate(.9)'},{id:'k1',name:'Take 1 · original',f:''}],
 takeDrag:null,takeFly:null,takeSnap:false,
 broll:null,threadX:null,plus:null,pop:null,rec:null,voiceSel:'My voice',voiceLine:'',
 cap:{look:'pop',x:.5,y:.72,sel:true,edit:null,editVal:'',caret:{segId:clips.c1.segs[1].id,idx:3},lang:null,langOpen:false},
 myStyles:E.MY_STYLES.slice(),recipes:E.RECIPES,styleOn:null,learn:true,
 idea:'',ideaStage:0,angle:null,ideaBeats:E.IDEA_BEATS.map(b=>Object.assign({},b,{fill:null,busy:false})),
 templates:E.TEMPLATES.slice(),ghost:null,dropKey:null,swapReady:false,fileDrag:null,drawer:false,toast:null,snip:null};
}

const M={
 initApp(){
  const el=this.rootRef.current;
  this._w=e=>this.onWheel(e);el.addEventListener('wheel',this._w,{passive:false});
  this._kd=e=>this.onKey(e,true);this._ku=e=>this.onKey(e,false);
  window.addEventListener('keydown',this._kd);window.addEventListener('keyup',this._ku);
  this._pm=e=>this.onMove(e);this._pu=e=>this.onUp(e);
  window.addEventListener('pointermove',this._pm);window.addEventListener('pointerup',this._pu);
  this._ro=new ResizeObserver(()=>{this.setState({vw:el.clientWidth,vh:el.clientHeight})});this._ro.observe(el);
  this.setState(Object.assign(initState(),{vw:el.clientWidth,vh:el.clientHeight}),()=>{this.go('idea',null,true);this.autoIdea()});
 },
 teardown(){const el=this.rootRef.current;if(el)el.removeEventListener('wheel',this._w);window.removeEventListener('keydown',this._kd);window.removeEventListener('keyup',this._ku);window.removeEventListener('pointermove',this._pm);window.removeEventListener('pointerup',this._pu);if(this._ro)this._ro.disconnect();cancelAnimationFrame(this.raf);[this.wv,this.ei,this.ri,this.ti].forEach(clearInterval)},
 // camera
 viewRect(mode){if(mode==='board'){const n=this.state.rows.length;return {x:20,y:1290,w:2340,h:150+n*ROWH+300}}return VIEW[mode]},
 fit(r){const {vw,vh}=this.state;const top=66,bot=78;const ah=Math.max(200,vh-top-bot);const z=Math.min(vw/r.w,ah/r.h);return {z,x:vw/2-(r.x+r.w/2)*z,y:top+ah/2-(r.y+r.h/2)*z}},
 go(mode,extra,instant){const st=Object.assign({},this.state,extra||{});const cam=this.fit(this.viewRect.call({state:st},mode));this.setState(Object.assign({mode,cam,camAnim:!instant,plus:null,pop:null,menu:null},extra||{}));clearTimeout(this.camT);this.camT=setTimeout(()=>this.setState({camAnim:false}),1000)},
 s2w(x,y){const c=this.state.cam;return {x:(x-c.x)/c.z,y:(y-c.y)/c.z}},
 onWheel(e){
  if(e.target.closest&&e.target.closest('[data-scroll]')&&Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  if(e.target.closest&&e.target.closest('[data-drawer]'))return;
  e.preventDefault();const r=this.rootRef.current.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const c=this.state.cam;
  let cam;if(e.shiftKey){cam={x:c.x-e.deltaY,y:c.y,z:c.z}}else{const k=Math.exp(-e.deltaY*(e.ctrlKey?.012:.0018));const z=clamp(c.z*k,.08,4);cam={z,x:mx-(mx-c.x)*(z/c.z),y:my-(my-c.y)*(z/c.z)}}
  this.setState({cam,camAnim:false});clearTimeout(this.wt);this.wt=setTimeout(()=>this.snap(),240);
 },
 snap(){
  const s=this.state;const base=this.fit(this.viewRect(s.mode)).z;const r=s.cam.z/base;
  if(s.mode==='edit'&&r<.62)this.go('board');
  else if(s.mode==='edit'&&r>1.4)this.go('theater');
  else if(s.mode==='theater'&&r<.75)this.go('edit');
  else if(s.mode==='idea'&&r<.6)this.go('board');
  else if(s.mode==='board'&&r>1.7){const w=this.s2w(s.vw/2,s.vh/2);let best=null,bd=1e9;s.rows.forEach((row,ri)=>row.cards.forEach((k,ci)=>{if(!k.c)return;const x=BX+ci*(CW+GAP)+CW/2,y=BY0+ri*ROWH+60+CH/2;const d=Math.hypot(x-w.x,y-w.y);if(d<bd){bd=d;best=k.c}}));if(best)this.openClip(best)}
 },
 // clips
 vis(s){s=s||this.state;const c=s.clips[s.active];let segs=s.momentsOnly?c.segs.filter(x=>x.key):c.segs;if(!segs.length)segs=c.segs;const total=segs.reduce((a,b)=>a+b.dur,0)||1;return {c,segs,total,pps:this.trimPps||TW/total}},
 cur(s){s=s||this.state;const v=this.vis(s);let acc=0,o={seg:v.segs[0],start:0,idx:0};for(let i=0;i<v.segs.length;i++){const g=v.segs[i];if(s.t>=acc&&s.t<acc+g.dur){o={seg:g,start:acc,idx:i};break}acc+=g.dur;if(i===v.segs.length-1)o={seg:g,start:acc-g.dur,idx:i}}return o},
 upClip(cid,patch){this.setState(s=>{const c=s.clips[cid];if(!c)return null;const p=typeof patch==='function'?patch(c):patch;return {clips:Object.assign({},s.clips,{[cid]:Object.assign({},c,p)})}})},
 updSeg(segId,patch){const s=this.state;this.upClip(s.active,c=>({segs:c.segs.map(g=>g.id===segId?Object.assign({},g,patch):g)}))},
 segRange(s,segId){const v=this.vis(s);let acc=0;for(const g of v.segs){if(g.id===segId)return {a:acc,b:acc+g.dur};acc+=g.dur}return {a:0,b:v.total}},
 newClip(name,kind,scene,segs,src){const id=E.nid('c');const c=E.mk(id,name,kind,scene,[]);c.segs=segs.map(g=>Object.assign({},g,{id:E.nid('s'),fresh:true}));if(src){c.src=src.src;c.isVid=src.isVid;c.glow=src.glow}return c},
 slotOf(s,cid){for(let ri=0;ri<s.rows.length;ri++){const ci=s.rows[ri].cards.findIndex(k=>k.c===cid);if(ci>=0)return {x:BX+ci*(CW+GAP),y:BY0+ri*ROWH+60,w:CW,h:CH,r:18,ri,ci}}const f=s.free.find(f=>f.clip===cid);if(f)return {x:f.x,y:f.y,w:f.w,h:f.h,r:16};return null},
 openClip(cid){
  const s=this.state;const reset={t:.3,loop:null,talk:null,broll:null,plus:null,pop:null,playing:false,cap:Object.assign({},s.cap,{edit:null,caret:cid==='c1'?s.cap.caret:null})};
  if(cid===s.active){this.go('edit',reset);return}
  if(s.mode==='board'){this.setState(Object.assign({active:cid,heroInstant:true},reset),()=>requestAnimationFrame(()=>requestAnimationFrame(()=>this.go('edit',{heroInstant:false}))))}
  else{this.setState(Object.assign({active:cid},reset),()=>this.go('edit'))}
 },
 toast(msg){this.setState({toast:msg});clearTimeout(this.tt);this.tt=setTimeout(()=>this.setState({toast:null}),2600)},
 // playback
 togglePlay(){this.state.playing?this.setState({playing:false}):this.setState({playing:true},()=>this.play())},
 play(){if(this.raf)return;this.lt=null;const tick=ts=>{if(!this.state.playing){this.raf=null;return}const dt=this.lt==null?0:Math.min(.06,(ts-this.lt)/1000);this.lt=ts;this.acc=(this.acc||0)+dt;if(this.acc>=1/30){const d=this.acc;this.acc=0;this.setState(s=>{let t=s.t+d;if(s.loop){const r=this.segRange(s,s.loop);if(t>=r.b||t<r.a)t=r.a}else{const v=this.vis(s);if(t>=v.total)t=0}return {t}})}this.raf=requestAnimationFrame(tick)};this.raf=requestAnimationFrame(tick)},
 seekSeg(segId){const r=this.segRange(this.state,segId);this.setState({t:r.a+.05})},
 // split / trim
 splitAt(t){
  const s=this.state;if(s.mode!=='edit')return;const v=this.vis(s);let acc=0;
  for(const g of v.segs){if(t>acc+.2&&t<acc+g.dur-.2){const off=t-acc,n=g.words.length,k=Math.round(n*off/g.dur);const a=Object.assign({},g,{dur:off,words:g.words.slice(0,k),fresh:true});const b=Object.assign({},g,{id:E.nid('s'),dur:g.dur-off,words:g.words.slice(k),key:null,fresh:true});this.upClip(v.c.id,c=>({segs:c.segs.flatMap(x=>x.id===g.id?[a,b]:[x])}));this.setState({t,snip:{x:TX+t*v.pps}});clearTimeout(this.snT);this.snT=setTimeout(()=>{this.setState({snip:null});this.upClip(v.c.id,c=>({segs:c.segs.map(x=>x.fresh?Object.assign({},x,{fresh:false}):x)}))},600);return}acc+=g.dur}
 },
 toggleFiller(segId,j){this.upClip(this.state.active,c=>({segs:c.segs.map(g=>{if(g.id!==segId)return g;const words=g.words.map((w,i)=>i===j?Object.assign({},w,{cut:!w.cut}):w);return Object.assign({},g,{words,dur:g.dur+(g.words[j].cut?.3:-.3)})})}));this.toast(this.state.clips[this.state.active].segs.find(g=>g.id===segId).words[j].cut?'Restored “'+this.state.clips[this.state.active].segs.find(g=>g.id===segId).words[j].w+'”':'Cleaned again')},
 // key + menus
 onKey(e,down){
  const tag=(document.activeElement||{}).tagName;if(tag==='INPUT'||tag==='TEXTAREA'){if(down&&e.key==='Escape')document.activeElement.blur();return}
  if(e.code==='Space'){e.preventDefault();if(down&&!e.repeat)this.talkStart();if(!down)this.talkEnd();return}
  if(!down)return;const k=e.key.toLowerCase();const s=this.state;
  if(k==='s')this.splitAt(s.t);else if(k==='b')this.openBroll(null);else if(k==='t')this.setState({drawer:!s.drawer});else if(k==='m')this.setState({momentsOnly:!s.momentsOnly,t:0,loop:null});else if(k==='k'||k==='p')this.togglePlay();else if(k==='escape')this.escape();else if(k==='1')this.go('idea');else if(k==='2')this.go('board');else if(k==='3')this.go('edit');else if(k==='4')this.go('theater');
 },
 escape(){const s=this.state;if(s.menu||s.pop||s.plus||s.labelEdit)return this.setState({menu:null,pop:null,plus:null,labelEdit:null});if(s.loop)return this.setState({loop:null,playing:false});if(s.talk&&s.talk.phase==='done')return this.setState({talk:null});if(s.broll)return this.setState({broll:null});if(s.drawer)return this.setState({drawer:false});if(s.mode==='theater')return this.go('edit');if(s.mode==='edit')return this.go('board')},
 openMenu(e,kind,data){e.preventDefault();e.stopPropagation();this.setState({menu:{kind,data,x:e.clientX,y:e.clientY,saving:false,name:this.state.clips[this.state.active].name+' cut',def:false},plus:null,pop:null})},
 menuItems(m){
  const s=this.state;const close=f=>()=>{this.setState({menu:null});f&&f()};
  if(m.kind==='lens')return [{label:'Save as style…',hint:'',act:()=>this.setState({menu:Object.assign({},m,{saving:true})})},{label:'Add label',hint:'dbl-click',act:close(()=>this.setState({labelEdit:{key:'clip:'+s.active,x:m.x,y:m.y,val:''}}))},{label:'Split at playhead',hint:'S',act:close(()=>this.splitAt(s.t))},{label:'B-roll here',hint:'B',act:close(()=>this.openBroll(null))},{label:s.momentsOnly?'Show all beads':'Key moments only',hint:'M',act:close(()=>this.setState({momentsOnly:!s.momentsOnly,t:0}))},{label:'Export 9:16',hint:'',act:close(()=>this.startExport('clip:'+s.active,'9:16'))}];
  if(m.kind==='gap')return [{label:'B-roll here',hint:'B',act:close(()=>this.openBroll(m.data))},{label:'Voiceover here',hint:'',act:close(()=>this.setState({pop:{kind:'voice',g:m.data,x:m.x,y:m.y}}))},{label:'Grade',hint:'',act:close(()=>this.setState({pop:{kind:'grade',g:m.data,x:m.x,y:m.y}}))},{label:'Music',hint:'',act:close(()=>this.setState({pop:{kind:'music',g:m.data,x:m.x,y:m.y}}))},{label:'Text',hint:'',act:close(()=>this.addText(m.data))}];
  if(m.kind==='card')return [{label:'Open',hint:'click',act:close(()=>this.openClip(m.data))},{label:'Add label',hint:'dbl-click',act:close(()=>this.setState({labelEdit:{key:'clip:'+m.data,x:m.x,y:m.y,val:''}}))},{label:'Export 9:16',hint:'',act:close(()=>this.startExport('clip:'+m.data,'9:16'))}];
  if(m.kind==='row')return [{label:'Export full cut · 9:16',hint:'',act:close(()=>this.startExport('row:'+m.data,'9:16'))},{label:'Save as template',hint:'',act:close(()=>this.saveTemplate(m.data))}];
  if(m.kind==='style')return [{label:'Apply',hint:'click',act:close(()=>this.applyStyle(m.data))},{label:'Set as '+this.projectOf(s.active)+' default',hint:'',act:close(()=>{this.setState(st=>({myStyles:st.myStyles.map(x=>Object.assign({},x,{isDefault:x.id===m.data.id}))}));this.toast('“'+m.data.name+'” is now the '+this.projectOf(s.active)+' default')})}];
  return [];
 },
 projectOf(cid){const s=this.state;const r=s.rows.find(r=>r.cards.some(k=>k.c===cid));return r?r.project:'ShopLink'},
 captures(){const s=this.state,c=s.clips[s.active];const avg=(c.segs.reduce((a,b)=>a+b.dur,0)/c.segs.length).toFixed(1);return [['cut rhythm',avg+'s beats'],['zooms','2 punch-ins · 0.35s'],['transitions','hard cuts, 1 whip'],['grade',c.grade?c.grade.name:(c.talkLook?'warm sheets':'Morning')],['caption look',{pop:'word-by-word pop',karaoke:'karaoke highlight',lower:'clean lower third',caps:'all-caps punch'}[s.cap.look]],['music energy',c.music?c.music.energy:'calm']]},
 saveStyle(){const s=this.state,m=s.menu,c=s.clips[s.active];const cs=this.cur(s).seg;const st={id:E.nid('ms'),name:m.name||'Untitled style',scene:cs.scene==='src'?'selfie':cs.scene,f:[c.takeF,c.grade&&c.grade.filter,c.talkLook&&E.TALKF].filter(Boolean).join(' '),look:s.cap.look,isDefault:m.def,fresh:true};this.setState(x=>({myStyles:[st].concat(x.myStyles.map(y=>m.def?Object.assign({},y,{isDefault:false}):y)),menu:null}));this.toast('Saved “'+st.name+'”'+(m.def?' · '+this.projectOf(s.active)+' default':''))},
 applyStyle(st){this.upClip(this.state.active,{style:{name:st.name,filter:st.f}});this.setState(s=>({styleOn:st.id,cap:Object.assign({},s.cap,{look:st.look})}));this.toast('Applied “'+st.name+'”')},
 // labels
 openLabel(e,key){e.stopPropagation();e.preventDefault();this.setState({labelEdit:{key,x:e.clientX,y:e.clientY,val:''},menu:null})},
 commitLabel(){const le=this.state.labelEdit;if(!le)return;const v=le.val.trim();if(v){this.setState(s=>({labels:Object.assign({},s.labels,{[le.key]:(s.labels[le.key]||[]).concat([v])})}));if(v[0]==='#')this.toast('Grouped under '+v+' on the storyboard')}this.setState({labelEdit:null})},
 removeLabel(key,i){this.setState(s=>({labels:Object.assign({},s.labels,{[key]:(s.labels[key]||[]).filter((_,j)=>j!==i)})}))},
 // export
 startExport(key,ratio){if(this.state.exp&&this.state.exp.phase==='render')return;this.setState({exp:{key,ratio,p:0,phase:'render'}});clearInterval(this.ei);this.ei=setInterval(()=>{const x=this.state.exp;if(!x){clearInterval(this.ei);return}const p=Math.min(1,x.p+(key.startsWith('row')?.014:.024));if(p>=1){clearInterval(this.ei);try{navigator.clipboard.writeText('https://eyelore.app/r/'+key.replace(':','-')+'-'+ratio.replace(':','x'))}catch(e){}this.setState({exp:Object.assign({},x,{p:1,phase:'done'})});clearTimeout(this.edt);this.edt=setTimeout(()=>this.setState({exp:null}),6000)}else this.setState({exp:Object.assign({},x,{p})})},40)},
 pillFor(key){const s=this.state;const x=s.exp&&s.exp.key===key?s.exp:null;const st=e=>e&&e.stopPropagation();const go=r=>e=>{st(e);this.startExport(key,r)};return {show:!!x||s.hover===key,idle:!x,busy:!!x&&x.phase==='render',done:!!x&&x.phase==='done',label:x?'Rendering '+x.ratio+' · '+Math.round(x.p*100)+'%':'',on916:go('9:16'),on45:go('4:5'),on169:go('16:9'),onDl:go('9:16'),onCopy:e=>{st(e);this.toast('Link copied')},onDownload:e=>{st(e);this.toast('Downloading '+(x?x.ratio:'')+' · '+(key.startsWith('row')?'full cut':'clip'));this.setState({exp:null})},ring:!!x,off:x?(100-x.p*100):100}},
 // takes
 takeDown(e){e.stopPropagation();this.drag={type:'take',sx:e.clientX,sy:e.clientY,lx:e.clientX,lt:performance.now(),vx:0}},
 endTake(d){const td=this.state.takeDrag;if(!d.moved){const k=this.state.takes[0];this.upClip(this.state.active,{takeF:k.f||null});this.toast('Using '+k.name);return}const dx=td?td.dx:0;if(Math.abs(dx)>70||Math.abs(d.vx)>.45){const dir=(Math.abs(d.vx)>.45?Math.sign(d.vx):Math.sign(dx))||1;this.setState({takeFly:{dir,dy:td?td.dy:0},takeDrag:null});setTimeout(()=>{this.setState(s=>({takes:s.takes.slice(1).concat([s.takes[0]]),takeFly:null,takeSnap:true}));requestAnimationFrame(()=>requestAnimationFrame(()=>this.setState({takeSnap:false})))},380)}else this.setState({takeDrag:null})},
 // talk
 talkStart(){const s=this.state;if(s.mode!=='edit'||(s.talk&&s.talk.phase!=='done'))return;const sc=this.cur(s).seg.scene;this.setState({talk:{phase:'listen',pts:[],text:'',phrase:E.TALK[sc]||E.TALK.bed,t0:Date.now(),R:0,cx:180,cy:320,stage:0},playing:false,menu:null,plus:null,pop:null});clearInterval(this.wv);this.wv=setInterval(()=>this.waveTick(),60)},
 waveTick(){const s=this.state;if(!s.talk)return;const el=Date.now()-s.talk.t0;const live=s.talk.phase==='listen';const wave=s.wave.map((h,i)=>{const tg=live?(.14+.86*Math.abs(Math.sin(el/140+i*.7)*Math.sin(el/390+i*.31))*(.55+Math.random()*.45)):.06;return h+(tg-h)*.45});this.setState({wave,talk:Object.assign({},s.talk,{text:live?s.talk.phrase.slice(0,Math.floor(el/40)):s.talk.text})})},
 addBrush(e){const el=this.heroInner.current;if(!el)return;const r=el.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*EDIT.w,y=(e.clientY-r.top)/r.height*EDIT.h;this.setState(s=>s.talk?{talk:Object.assign({},s.talk,{pts:s.talk.pts.concat([[x,y]])})}:null)},
 talkEnd(){const s=this.state;if(!s.talk||s.talk.phase!=='listen')return;const p=s.talk.pts;let cx=180,cy=320,R=150;if(p.length>2){cx=p.reduce((a,b)=>a+b[0],0)/p.length;cy=p.reduce((a,b)=>a+b[1],0)/p.length;R=Math.max(...p.map(q=>Math.hypot(q[0]-cx,q[1]-cy)))+28}
  this.setState({talk:Object.assign({},s.talk,{phase:'think',text:s.talk.phrase,cx,cy,rSel:R,R:0})});
  setTimeout(()=>{this.setState(st=>st.talk?{talk:Object.assign({},st.talk,{phase:'reveal',R:0,stage:0})}:null);requestAnimationFrame(()=>requestAnimationFrame(()=>this.setState(st=>st.talk?{talk:Object.assign({},st.talk,{R:st.talk.rSel,stage:1})}:null)));setTimeout(()=>this.setState(st=>st.talk?{talk:Object.assign({},st.talk,{R:1100,stage:2})}:null),1000);setTimeout(()=>this.finishTalk(),2400)},950)},
 finishTalk(){const s=this.state;if(!s.talk)return;clearInterval(this.wv);this.upClip(s.active,{talkLook:{cx:s.talk.cx,cy:s.talk.cy}});this.setState(st=>({talk:Object.assign({},st.talk,{phase:'done'}),takes:[{id:E.nid('k'),name:'Take '+(st.takes.length+1)+' · from your voice',f:E.TALKF,talk:true}].concat(st.takes),wave:st.wave.map(()=>.06)}))},
 undoTalk(){this.upClip(this.state.active,{talkLook:null});this.setState(s=>({talk:null,takes:s.takes[0]&&s.takes[0].talk?s.takes.slice(1):s.takes}));this.toast('Undone')},
 // b-roll
 openBroll(g){const s=this.state;if(s.mode!=='edit')return;if(g==null){const v=this.vis(s);let acc=0;g=0;v.segs.forEach((x,i)=>{acc+=x.dur;if(acc<=s.t+.01)g=i+1})}this.setState({broll:{g,query:'ring on a nightstand, night, slow push-in',gen:'idle'},plus:null,pop:null,menu:null})},
 brollResults(q){const ql=(q||'').toLowerCase();const want=/night|lamp|nightstand|dark/.test(ql)?'night':/gym|dumbbell|workout/.test(ql)?'gym':/dresser|case|rose|jewel/.test(ql)?'dresser':/bed|sheet|morning/.test(ql)?'bed':/selfie|sofa|creator|lights/.test(ql)?'selfie':'night';const o=['bed','dresser','gym','selfie','night'].filter(x=>x!==want);
  return [{id:'b1',scene:want,crop:2,src:'library',meta:'ShopLink · wear it to bed'},{id:'gen',scene:want,crop:1,src:'generate',meta:'matched grade · ring locked'},{id:'b2',scene:want,crop:4,src:'stock',meta:'4K · 0:06'},{id:'b3',scene:o[0],crop:3,src:'library',meta:'Everstock · dresser glow-up'},{id:'b4',scene:want,crop:0,src:'stock',meta:'4K · 0:09'},{id:'b5',scene:o[1],crop:2,src:'library',meta:'ShopLink · travel day'}]},
 renderGen(){this.setState(s=>({broll:Object.assign({},s.broll,{gen:'busy'})}));setTimeout(()=>this.setState(s=>s.broll?{broll:Object.assign({},s.broll,{gen:'done'})}:null),2200)},
 autoBroll(){const s=this.state,c=s.clips[s.active];const res=this.brollResults(s.broll?s.broll.query:'night');let n=0;const segs=c.segs.map(g=>{if(!g.broll&&g.dur>3&&g.words.some(w=>!w.cut)){const r=res[n%2?3:0];n++;return Object.assign({},g,{broll:{scene:r.scene,crop:r.crop},fresh:true})}return g});this.upClip(c.id,{segs});this.toast(n?'Suggested b-roll for '+n+' talking beads over 3s':'No talking beads over 3s')},
 insertSeg(i,seg){const s=this.state,v=this.vis(s);const segs=v.c.segs.slice();if(i>=v.segs.length){const last=v.segs[v.segs.length-1];segs.splice(segs.findIndex(x=>x.id===last.id)+1,0,seg)}else segs.splice(segs.findIndex(x=>x.id===v.segs[i].id),0,seg);this.upClip(v.c.id,{segs});setTimeout(()=>this.upClip(v.c.id,c=>({segs:c.segs.map(x=>x.id===seg.id?Object.assign({},x,{fresh:false}):x)})),700)},
 gapTime(g){const v=this.vis();return v.segs.slice(0,g).reduce((a,b)=>a+b.dur,0)},
 // one-gesture adds
 glyph(kind,g,e){e.stopPropagation();if(kind==='broll')return this.openBroll(g);if(kind==='text')return this.addText(g);this.setState({pop:{kind,g,x:e.clientX,y:e.clientY},plus:null})},
 addText(g){const t0=this.gapTime(g);this.upClip(this.state.active,c=>({texts:c.texts.concat([{id:E.nid('x'),t0,dur:2,text:'Sleep, measured.'}])}));this.setState({plus:null,pop:null,t:t0+.1});this.toast('Text placed at '+fmt(t0))},
 recToggle(){const s=this.state;if(s.rec){this.recStop();return}this.setState({rec:{g:s.pop.g,t0:this.gapTime(s.pop.g),bars:[]}});clearInterval(this.ri);this.ri=setInterval(()=>{const r=this.state.rec;if(!r){clearInterval(this.ri);return}if(r.bars.length>=52){this.recStop();return}this.setState({rec:Object.assign({},r,{bars:r.bars.concat([.15+Math.random()*.85*Math.abs(Math.sin(r.bars.length/3))])})})},70)},
 recStop(){clearInterval(this.ri);const r=this.state.rec;if(!r)return;this.placeVoice(r.t0,r.bars,'Made for the night shift.','My voice')},
 placeVoice(t0,bars,text,voice){const dur=Math.max(.8,bars.length*.07);this.upClip(this.state.active,c=>({voice:c.voice.concat([{id:E.nid('v'),t0,dur,bars,text,voice}]),music:c.music||{name:'Soft pulse',energy:'mid'}}));this.setState({rec:null,pop:null,voiceLine:''});this.toast('Voiceover placed · music ducked · captions added')},
 typedVoice(){const s=this.state;const txt=s.voiceLine.trim();if(!txt)return;const n=Math.max(8,txt.split(' ').length*5);const bars=Array.from({length:n},(_,i)=>.2+.7*Math.abs(Math.sin(i*.9))*Math.random());this.placeVoice(this.gapTime(s.pop.g),bars,txt,s.voiceSel)},
 // drag + drop
 findDrop(x,y,accept){const els=document.elementsFromPoint(x,y);for(const el of els){const k=el.getAttribute&&el.getAttribute('data-drop');if(k&&accept(k))return k}return null},
 startGhostDrag(e,type,ghost,accept,extra){e.stopPropagation();this.drag=Object.assign({type,sx:e.clientX,sy:e.clientY,ghost,accept},extra||{})},
 onMove(e){
  const d=this.drag;if(!d)return;const dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(!d.moved&&Math.hypot(dx,dy)>5)d.moved=true;if(!d.moved)return;const z=this.state.cam.z;
  switch(d.type){
   case 'pan':this.setState({cam:Object.assign({},this.state.cam,{x:d.cx+dx,y:d.cy+dy}),camAnim:false});break;
   case 'trim':this.updSeg(d.segId,{dur:Math.max(.4,d.dur0+dx/(z*d.pps))});break;
   case 'take':{const now=performance.now();d.vx=(e.clientX-d.lx)/Math.max(1,now-d.lt);d.lx=e.clientX;d.lt=now;this.setState({takeDrag:{dx:dx/z,dy:dy/z}});break}
   case 'cap':this.setState(s=>({cap:Object.assign({},s.cap,{x:clamp(d.ox+dx/d.w,.14,.86),y:clamp(d.oy+dy/d.h,.1,.92),sel:true})}));break;
   case 'brush':this.addBrush(e);break;
   case 'free':this.setState(s=>({free:s.free.map(f=>f.id===d.fid?Object.assign({},f,{x:d.ox+dx/z,y:d.oy+dy/z}):f)}));break;
   default:{const key=this.findDrop(e.clientX,e.clientY,d.accept);const s=this.state;let swap=s.swapReady;if(key!==s.dropKey){swap=false;clearTimeout(this.swT);if(key&&key.startsWith('bead:')&&d.type==='broll')this.swT=setTimeout(()=>this.setState({swapReady:true}),650)}this.setState({ghost:Object.assign({},d.ghost,{x:e.clientX-d.ghost.w/2,y:e.clientY-d.ghost.h/2}),dropKey:key,swapReady:swap})}
  }
 },
 onUp(e){
  const d=this.drag;this.drag=null;if(!d)return;
  switch(d.type){
   case 'trim':this.trimPps=null;this.forceUpdate();break;
   case 'take':this.endTake(d);break;
   case 'cap':if(!d.moved&&d.word)this.setState(s=>({cap:Object.assign({},s.cap,{sel:true,edit:d.word,editVal:d.wordText,caret:null})}));else if(!d.moved)this.setState(s=>({cap:Object.assign({},s.cap,{sel:!s.cap.sel})}));break;
   case 'free':if(!d.moved)this.openClip(d.clip);break;
   case 'bead':if(!d.moved)this.seekSeg(d.segId);else this.dropBead(d,e);break;
   case 'card':if(!d.moved)this.openClip(d.cid);else this.dropCard(d,e);break;
   case 'broll':if(d.moved)this.dropBroll(d);break;
   case 'ref':if(d.moved)this.dropRef(d);break;
  }
  if(d.ghost)this.setState({ghost:null,dropKey:null,swapReady:false});
 },
 fillGhost(key,cid){const p=key.split(':');if(p[0]==='ighost'){const i=+p[1];this.setState(s=>({ideaBeats:s.ideaBeats.map((b,j)=>j===i?Object.assign({},b,{fill:cid,busy:false}):b)}));this.toast('Beat filled · idea re-scored')}else{const rid=p[1],ci=+p[2];this.setState(s=>({rows:s.rows.map(r=>r.id===rid?Object.assign({},r,{cards:r.cards.map((k,j)=>j===ci?{c:cid}:k)}):r)}))}},
 dropBead(d,e){
  const s=this.state,key=s.dropKey,c=s.clips[s.active];const g=c.segs.find(x=>x.id===d.segId);if(!g)return;
  if(c.segs.length<2){this.toast('A Lens needs at least one bead');return}
  const rest=c.segs.filter(x=>x.id!==d.segId);const nm=g.words.filter(w=>!w.cut).slice(0,3).map(w=>w.w).join(' ')||'b-roll';
  if(key&&key.startsWith('clip:')){const tid=key.slice(5);if(tid===s.active)return;this.setState(st=>({clips:Object.assign({},st.clips,{[st.active]:Object.assign({},c,{segs:rest}),[tid]:Object.assign({},st.clips[tid],{segs:st.clips[tid].segs.concat([Object.assign({},g,{fresh:true})])})})}));this.toast('Merged into '+s.clips[tid].name);return}
  if(key&&/^(ghost|ighost):/.test(key)){const nc=this.newClip(nm+'…',c.kind,g.scene,[g],c.src?c:null);this.setState(st=>({clips:Object.assign({},st.clips,{[st.active]:Object.assign({},c,{segs:rest}),[nc.id]:nc})}),()=>this.fillGhost(key,nc.id));return}
  if(Math.abs(e.clientY-d.sy)/s.cam.z<50)return;
  const w=this.s2w(e.clientX,e.clientY);const nc=this.newClip(nm+'…',c.kind,g.scene,[g],c.src?c:null);
  this.setState(st=>({clips:Object.assign({},st.clips,{[st.active]:Object.assign({},c,{segs:rest}),[nc.id]:nc}),free:st.free.concat([{id:E.nid('f'),clip:nc.id,x:w.x-75,y:w.y-133,w:150,h:267,fresh:true}])}));this.toast('Bead lifted into its own Lens');
 },
 dropCard(d,e){
  const s=this.state,key=s.dropKey;if(!key)return;const p=key.split(':');
  if(p[0]==='row'){const w=this.s2w(e.clientX,e.clientY);const tr=s.rows.find(r=>r.id===p[1]);let idx=clamp(Math.round((w.x-BX-CW/2)/(CW+GAP)+.5),0,tr.cards.length);this.setState(st=>{let rows=st.rows.map(r=>Object.assign({},r,{cards:r.cards.slice()}));let src=rows.find(r=>r.id===d.rid);if(src){src.cards.splice(d.ci,1);if(src.id===p[1]&&d.ci<idx)idx--}const t=rows.find(r=>r.id===p[1]);t.cards.splice(clamp(idx,0,t.cards.length),0,{c:d.cid});return {rows}});this.toast('Re-sequenced “'+tr.name+'”');return}
  if(p[0]==='ghost'){this.setState(st=>({rows:st.rows.map(r=>r.id===d.rid?Object.assign({},r,{cards:r.cards.filter((_,j)=>j!==d.ci)}):r)}),()=>{let ci=+p[2];if(d.rid===p[1]&&d.ci<ci)ci--;this.fillGhost('ghost:'+p[1]+':'+ci,d.cid)});return}
  if(p[0]==='ighost')this.fillGhost(key,d.cid);
 },
 dropBroll(d){const s=this.state,key=s.dropKey,it=d.item;if(!key)return;const p=key.split(':');const seg=E.S(it.scene,it.crop,1.6,'',null);seg.isB=true;seg.fresh=true;
  if(p[0]==='gap'){this.insertSeg(+p[1],seg);this.toast('B-roll inserted as a new bead');return}
  if(p[0]==='bead'){const v=this.vis(s);const tg=v.segs[+p[1]];if(s.swapReady){this.updSeg(tg.id,{scene:it.scene,crop:it.crop,fresh:true});this.toast('Swapped footage, kept the words')}else{this.insertSeg(+p[1]+1,seg);this.toast('B-roll inserted')}return}
  if(/^(ghost|ighost)$/.test(p[0])){const nc=this.newClip(it.src+' b-roll',it.src==='generate'?'gen':'cam',it.scene,[seg]);this.setState(st=>({clips:Object.assign({},st.clips,{[nc.id]:nc})}),()=>this.fillGhost(key,nc.id))}},
 dropRef(d){const key=this.state.dropKey;if(!key)return;const cid=key.slice(5);this.upClip(cid,{grade:d.ref.grade});this.setState({pop:null});this.toast('Graded from '+d.ref.grade.name)},
 genGhost(rid,ci){const s=this.state;const row=s.rows.find(r=>r.id===rid);const g=row.cards[ci].ghost;this.setState(st=>({rows:st.rows.map(r=>r.id===rid?Object.assign({},r,{cards:r.cards.map((k,j)=>j===ci?{ghost:Object.assign({},k.ghost,{busy:true})}:k)}):r)}));setTimeout(()=>{const nc=E.mk(E.nid('c'),g.p.toLowerCase(),'gen',E.PSCENE[g.p]||'bed',[[g.p+' beat.',parseFloat(g.len)||2,'line',ci%5]]);this.setState(st=>({clips:Object.assign({},st.clips,{[nc.id]:nc})}),()=>this.fillGhost('ghost:'+rid+':'+ci,nc.id))},1800)},
 genIdea(i){const b=this.state.ideaBeats[i];if(b.fill||b.busy)return;this.setState(s=>({ideaBeats:s.ideaBeats.map((x,j)=>j===i?Object.assign({},x,{busy:true}):x)}));setTimeout(()=>{const nc=E.mk(E.nid('c'),b.p.toLowerCase(),'gen',['night','gym','bed','bed','selfie'][i],[[b.d+'.',parseFloat(b.len)||2,i===0?'hook':'line',[0,2,1,4,3][i]]]);this.setState(s=>({clips:Object.assign({},s.clips,{[nc.id]:nc})}),()=>this.fillGhost('ighost:'+i,nc.id))},1500+i*350)},
 addTemplate(t){const id=E.nid('r');this.setState(s=>({rows:s.rows.concat([{id,project:'ShopLink',name:'new ad',template:t.name,cards:t.beats.map(b=>({ghost:{p:b[0],len:b[1],busy:false}}))}])}),()=>this.go('board'));this.toast('“'+t.name+'” board added · drop footage on a beat or generate it')},
 saveTemplate(rid){const s=this.state,r=s.rows.find(x=>x.id===rid);const beats=r.cards.map(k=>{if(k.ghost)return [k.ghost.p,k.ghost.len];const tag=(s.labels['clip:'+k.c]||[]).find(l=>l[0]==='#');const c=s.clips[k.c];return [tag?tag.slice(1):c.name,Math.round(c.segs.reduce((a,b)=>a+b.dur,0))+'s']});this.setState(x=>({templates:x.templates.concat([{name:'“'+r.name+'”',beats,mine:true}])}));this.toast('Saved “'+r.name+'” as a template')},
 // idea
 autoIdea(){const target='ring that tracks sleep, for night-shift nurses';let i=0;clearTimeout(this.iaT);this.iaT=setTimeout(()=>{clearInterval(this.ti);this.ti=setInterval(()=>{if(this.userTyped){clearInterval(this.ti);return}i++;this.setState({idea:target.slice(0,i)});if(i>=target.length){clearInterval(this.ti);setTimeout(()=>{if(!this.userTyped)this.submitIdea()},500)}},34)},900)},
 submitIdea(){if(!this.state.idea.trim())return;this.setState({ideaStage:1});[2,3,4].forEach((n,i)=>setTimeout(()=>this.setState({ideaStage:n}),450*(i+1)))},
 // files
 onDragOver(e){e.preventDefault();const key=this.findDrop(e.clientX,e.clientY,k=>/^(clip|ghost|ighost):/.test(k));const s=this.state;if(!s.fileDrag||key!==s.dropKey||Math.abs(s.fileDrag.x-e.clientX)>6||Math.abs(s.fileDrag.y-e.clientY)>6)this.setState({fileDrag:{x:e.clientX,y:e.clientY},dropKey:key})},
 onDragLeave(e){if(!e.relatedTarget||!this.rootRef.current.contains(e.relatedTarget))this.setState({fileDrag:null,dropKey:null})},
 async readEntries(entries){const out=[];const walk=async en=>{if(en.isFile)out.push(await new Promise(r=>en.file(r,()=>r(null))));else if(en.isDirectory){const rd=en.createReader();const list=await new Promise(r=>rd.readEntries(r,()=>r([])));for(const x of list)await walk(x)}};for(const en of entries)await walk(en);return out.filter(Boolean)},
 async onDrop(e){
  e.preventDefault();const key=this.state.dropKey;const pos={x:e.clientX,y:e.clientY};this.setState({fileDrag:null,dropKey:null});
  let files=[...e.dataTransfer.files];let entries=[];try{entries=[...e.dataTransfer.items].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean)}catch(err){}
  if(entries.some(x=>x.isDirectory))files=await this.readEntries(entries);
  files=files.filter(f=>/^(video|image)\//.test(f.type));if(!files.length){this.toast('Drop video or image files, or a folder');return}
  if(key&&key.startsWith('clip:')&&files.length===1&&files[0].type.startsWith('image')){const url=URL.createObjectURL(files[0]);const col=await this.avgColor(url,false);this.upClip(key.slice(5),{grade:{name:'“'+files[0].name+'”',filter:'saturate(1.12) sepia(.1)',tint:col.replace('rgb','rgba').replace(')',',.5)')}});this.toast('Graded from '+files[0].name);return}
  const w=this.s2w(pos.x,pos.y);
  files.forEach((f,i)=>{const url=URL.createObjectURL(f);const isVid=f.type.startsWith('video');const id=E.nid('c');const c=E.mk(id,f.name,/screen|record/i.test(f.name)?'screen':'cam','src',[['',4,null]]);c.src=url;c.isVid=isVid;c.analysing='Transcribing…';
   this.setState(s=>({clips:Object.assign({},s.clips,{[id]:c})}),()=>{if(key&&/^(ghost|ighost):/.test(key)&&i===0)this.fillGhost(key,id);else this.setState(s=>({free:s.free.concat([{id:E.nid('f'),clip:id,x:w.x-75+(i%5)*175,y:w.y-133+Math.floor(i/5)*310,w:150,h:267,fresh:true}])}))});
   this.avgColor(url,isVid).then(col=>this.upClip(id,{glow:col}));
   setTimeout(()=>this.upClip(id,{analysing:'Finding beats…'}),900);setTimeout(()=>this.upClip(id,{analysing:'Cleaning fillers…'}),1800);
   setTimeout(()=>this.upClip(id,{analysing:null,segs:E.INGEST.map((l,j)=>E.S('src',0,l[1],l[0],l[2])),summary:'auto-split · 5 beads · 4 moments · 3 fillers cleaned'}),2700+i*200);
  });
  this.toast(files.length>1?files.length+' clips landing as Lenses':'Landing as a Lens');
 },
 avgColor(url,isVid){return new Promise(res=>{const done=el=>{try{const cv=document.createElement('canvas');cv.width=cv.height=8;const ctx=cv.getContext('2d');ctx.drawImage(el,0,0,8,8);const d=ctx.getImageData(0,0,8,8).data;let r=0,g=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2]}const n=d.length/4;res('rgb('+Math.round(r/n)+','+Math.round(g/n)+','+Math.round(b/n)+')')}catch(e){res('rgb(200,154,114)')}};if(isVid){const v=document.createElement('video');v.muted=true;v.src=url;v.onloadeddata=()=>{v.currentTime=Math.min(.5,v.duration/2||0)};v.onseeked=()=>done(v);v.onerror=()=>res('rgb(200,154,114)')}else{const im=new Image();im.onload=()=>done(im);im.onerror=()=>res('rgb(200,154,114)');im.src=url}})},
 media(scene,crop,clip){if(scene==='src'&&clip&&clip.src){const g=clip.glow||'rgb(200,154,114)';const R=E.React;return {vidEl:clip.isVid&&R?R.createElement('video',{key:clip.src,src:clip.src,muted:true,autoPlay:true,loop:true,playsInline:true,style:{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}):null,imgBg:clip.isVid?'none':'url("'+clip.src+'") center / cover no-repeat',bg:'linear-gradient(160deg,#3a332c,#1e1a17)',tf:'none',src:clip.src,vid:!!clip.isVid,img:!clip.isVid,glowBg:'radial-gradient(closest-side,'+g+','+g.replace('rgb','rgba').replace(')',',0)')+')',tone:'sun'}}const sc=E.SC[scene]||E.SC.bed;return {vidEl:null,imgBg:'none',bg:sc.bg,tf:E.CROPS[crop||0],src:'',vid:false,img:false,glowBg:sc.bg,tone:sc.tone}}
};

function render(self){
 const s=self.state;if(!s.ready)return {ready:false};
 const P=self.props||{};const amb=P.ambient??1;const marks=P.showMarks??true;const grain=P.grain??true;
 const z=s.cam.z,inv=1/z,hair=Math.max(1.3/z,.7);const fs15=clamp(15/z,15,28),fs12=clamp(12/z,12,22),cav=clamp(20/z,20,34);
 const stop=e=>e.stopPropagation();
 const v=self.vis(s),c=v.c;const cu=self.cur(s);const cur=cu.seg;const local=cur?clamp((s.t-cu.start)/cur.dur,0,1):0;
 let mS=cur?cur.scene:c.scene,mC=cur?cur.crop:0;if(cur&&cur.broll&&local>.3&&local<.75){mS=cur.broll.scene;mC=cur.broll.crop}
 const hm=self.media(mS,mC,c);
 const filt=[c.takeF,c.grade&&c.grade.filter,c.style&&c.style.filter,c.talkLook&&E.TALKF].filter(Boolean).join(' ')||'none';
 const mode=s.mode,edit=mode==='edit',th=mode==='theater',bd=mode==='board';
 let hr=th?THEATER:bd?(self.slotOf(s,s.active)||EDIT):EDIT;
 const heroDrop=s.dropKey==='clip:'+s.active;
 const SPR='cubic-bezier(.34,1.22,.5,1)';
 const hero={x:hr.x,y:hr.y,w:hr.w,h:hr.h,r:hr.r,
  tr:s.heroInstant?'none':['left','top','width','height','border-radius'].map(p=>p+' .85s '+SPR).join(','),
  glowBg:hm.glowBg,blur:th?120:bd?34:84,glowOp:amb*(th?1:bd?.6:.78),toneBg:E.TONE[hm.tone],toneInset:th?'-160%':bd?'-60%':'-90%',toneOp:Math.min(1,amb*(th?1.2:.8)),
  shadow:heroDrop?DROPGLOW:BASESH,cursor:s.talk&&s.talk.phase==='listen'?'crosshair':bd?'grab':'pointer',
  zoom:s.loop?'scale(1.14)':'scale(1)',filter:filt,bg:hm.bg,tf:hm.tf,vid:hm.vid,img:hm.img,src:hm.src,vidEl:hm.vidEl,imgBg:hm.imgBg,anim:s.playing?'drift 16s ease-in-out infinite':'none',
  light:c.talkLook?'radial-gradient(circle 280px at '+c.talkLook.cx+'px '+c.talkLook.cy+'px, rgba(255,206,130,.7), rgba(255,206,130,0))':'none',
  tint:c.grade?c.grade.tint:'rgba(0,0,0,0)',analysing:!!c.analysing,status:c.analysing||'',
  mark:c.kind==='gen'?'gen':c.kind==='screen'?'screen':'cam',markShow:marks&&!th,
  onEnter:()=>self.setState({hover:'clip:'+s.active}),onLeave:()=>self.setState({hover:null}),
  onDown:e=>{if(s.talk&&s.talk.phase==='listen'&&edit){e.stopPropagation();self.drag={type:'brush',sx:e.clientX,sy:e.clientY,moved:true};self.addBrush(e);return}if(bd){const sl=self.slotOf(s,s.active)||{};self.startGhostDrag(e,'card',{w:72,h:128,r:'10px',bg:hm.bg,tf:hm.tf},k=>/^(row|ghost|ighost):/.test(k),{cid:s.active,rid:sl.ri!=null?s.rows[sl.ri].id:null,ci:sl.ci});return}e.stopPropagation()},
  onClick:e=>{if((edit||th)&&!s.talk)self.togglePlay()},
  onDbl:e=>self.openLabel(e,'clip:'+s.active),onCtx:e=>self.openMenu(e,bd?'card':'lens',s.active),
  pill:self.pillFor('clip:'+s.active),inv,
  labels:(s.labels['clip:'+s.active]||[]).map((t,i)=>({t,rot:(i%2?2:-3)+'deg',onClick:e=>{e.stopPropagation();if(e.altKey)self.removeLabel('clip:'+s.active,i)}}))};
 hero.ringW=hr.w+12;hero.ringH=hr.h+12;hero.ringRx=hr.r+6;
 // talk
 const tk=s.talk;const talk={show:!!tk&&edit,listen:!!tk&&tk.phase==='listen',think:!!tk&&tk.phase==='think',reveal:!!tk&&(tk.phase==='reveal'||tk.phase==='think'),done:!!tk&&tk.phase==='done'};
 if(tk){const p=tk.pts;talk.path=p.length>1?'M'+p.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' L'):'';talk.brush=p.length>1&&tk.phase!=='done';talk.brushAnim=tk.phase==='think'?'pulse .7s ease-in-out infinite':'none';
  talk.clip='circle('+tk.R+'px at '+tk.cx+'px '+tk.cy+'px)';talk.tr=tk.stage===1?'clip-path .8s cubic-bezier(.3,1.25,.5,1)':tk.stage===2?'clip-path 1.4s cubic-bezier(.65,0,.3,1)':'none';
  talk.filter=[filt==='none'?'':filt,E.TALKF].join(' ');talk.light='radial-gradient(circle 280px at '+tk.cx+'px '+tk.cy+'px, rgba(255,206,130,.7), rgba(255,206,130,0))';
  talk.status=tk.phase==='listen'?'Listening · brush where it should change':tk.phase==='think'?'Working inside your selection':tk.phase==='reveal'?'Revealing…':'Applied inside your selection, then blended out';
  talk.text=tk.text||'';talk.caret=tk.phase==='listen';talk.empty=!tk.text&&tk.phase==='listen';talk.dot=tk.phase==='listen'?'#E0483E':'#1A1A1A';talk.region=p.length>2?'selection':'whole frame';}
 talk.bars=s.wave.map(h=>({h:Math.round(4+h*44)}));
 talk.onKeep=()=>self.setState({talk:null});talk.onUndo=()=>self.undoTalk();talk.onRetry=()=>{self.undoTalk();self.toast('Hold Space and say it again')};
 // captions
 let words=[],voiceOn=false;const vItem=c.voice.find(x=>s.t>=x.t0&&s.t<x.t0+x.dur);
 if(vItem){voiceOn=true;const ws=vItem.text.split(' ');const wi=Math.floor(clamp((s.t-vItem.t0)/vItem.dur,0,.999)*ws.length);words=ws.map((w,i)=>({w,i:-1,cur:i===wi,pos:i,wi}))}
 else if(cur){const vis=cur.words.map((w,i)=>({w:w.w,i,cut:w.cut})).filter(w=>!w.cut);const wi=Math.floor(local*.999*vis.length);words=vis.map((w,k)=>({w:w.w,i:w.i,cur:k===wi,pos:k,wi}))}
 const look=s.cap.look;const wi0=words.length?words[0].wi:0;
 let shown=look==='pop'?words.filter(w=>w.pos<=w.wi):look==='caps'?words.filter(w=>w.pos>=w.wi-1&&w.pos<=w.wi):words;
 const capObj={show:(edit||th)&&words.length>0&&!c.analysing,left:s.cap.x*100,top:s.cap.y*100,
  fs:look==='pop'?28:look==='karaoke'?24:look==='lower'?15:40,fw:look==='lower'?500:look==='caps'?700:600,tt:look==='caps'?'uppercase':'none',
  justify:look==='lower'?'flex-start':'center',bg:look==='lower'?'rgba(20,18,16,.45)':'rgba(0,0,0,0)',bf:look==='lower'?'blur(14px)':'none',pad:look==='lower'?'10px 14px':'6px 10px',
  ts:look==='lower'?'none':'0 2px 16px rgba(0,0,0,.5)',ring:s.cap.sel&&edit?'0 0 0 1.5px rgba(61,123,242,.9)':'none',
  pill:s.cap.sel&&edit&&!tk,pillTop:s.cap.y*hr.h-112,langOpen:s.cap.langOpen,
  looks:[['pop','Pop'],['karaoke','Karaoke'],['lower','Lower third'],['caps','Punch']].map(l=>({label:l[1],bg:look===l[0]?'#1A1A1A':'rgba(0,0,0,0)',color:look===l[0]?'#fff':'#1A1A1A',onClick:e=>{e.stopPropagation();self.setState(x=>({cap:Object.assign({},x.cap,{look:l[0]})}))}})),
  onTranslate:e=>{e.stopPropagation();self.setState(x=>({cap:Object.assign({},x.cap,{langOpen:!x.cap.langOpen})}))},
  langs:['ES','DE','JA','Off'].map(L=>({label:L,bg:(s.cap.lang===L||(L==='Off'&&!s.cap.lang))?'rgba(26,26,26,.1)':'rgba(0,0,0,0)',onClick:e=>{e.stopPropagation();self.setState(x=>({cap:Object.assign({},x.cap,{lang:L==='Off'?null:L,langOpen:false})}))}})),
  sub:!!s.cap.lang&&!voiceOn&&!!cur,subText:s.cap.lang&&cur?((cur.tr&&cur.tr[s.cap.lang])||'['+s.cap.lang+'] '+words.map(w=>w.w).join(' ')):'',lang:s.cap.lang||'',
  onBlockDown:e=>{if(!edit)return;e.stopPropagation();const r=self.heroInner.current.getBoundingClientRect();self.drag={type:'cap',sx:e.clientX,sy:e.clientY,ox:s.cap.x,oy:s.cap.y,w:r.width,h:r.height}},
  editVal:s.cap.editVal,onEditChange:e=>{const val=e.target.value;self.setState(x=>({cap:Object.assign({},x.cap,{editVal:val})}))},
  onEditKey:e=>{if(e.key==='Enter'||e.key==='Escape')e.target.blur()},
  onEditBlur:()=>{const ed=s.cap.edit;const val=(self.state.cap.editVal||'').trim();if(ed&&val){self.upClip(s.active,cc=>({segs:cc.segs.map(g=>g.id===ed.segId?Object.assign({},g,{words:g.words.map((w,i)=>i===ed.idx?Object.assign({},w,{w:val}):w)}):g)}))}self.setState(x=>({cap:Object.assign({},x.cap,{edit:null})}))}};
 capObj.words=shown.map(w=>{const editing=!!s.cap.edit&&cur&&s.cap.edit.segId===cur.id&&s.cap.edit.idx===w.i&&!voiceOn;const caret=!!s.cap.caret&&cur&&s.cap.caret.segId===cur.id&&s.cap.caret.idx===w.i&&!voiceOn&&edit;
  return {w:w.w,editing,plain:!editing,size:Math.max(2,w.w.length),caret,sc:look==='pop'&&w.cur?1.1:1,op:look==='karaoke'&&!w.cur?.82:1,bg:look==='karaoke'&&w.cur?'#fff':caret?'rgba(61,123,242,.28)':'rgba(0,0,0,0)',color:look==='karaoke'&&w.cur?'#1A1A1A':'#fff',
   down:e=>{if(!edit)return;e.stopPropagation();const r=self.heroInner.current.getBoundingClientRect();self.drag={type:'cap',sx:e.clientX,sy:e.clientY,ox:s.cap.x,oy:s.cap.y,w:r.width,h:r.height,word:w.i>=0&&cur?{segId:cur.id,idx:w.i}:null,wordText:w.w}}}});
 const txt=c.texts.find(x=>s.t>=x.t0&&s.t<x.t0+x.dur);capObj.title=!!txt&&(edit||th);capObj.titleText=txt?txt.text:'';
 // thread
 let x=TX;const gapsX=[TX];
 const beads=v.segs.map((g,i)=>{const w=g.dur*v.pps;const d=Math.max(18,Math.min(46,w-12));const cx=x+w/2;const m=self.media(g.scene,g.crop,c);const dk='bead:'+i;const o={id:g.id,x0:x,w,cx,d,left:cx-d/2,top:TY-d/2,bg:m.bg,tf:m.tf,vid:m.vid,img:m.img,src:m.src,vidEl:m.vidEl,imgBg:m.imgBg,
  shadow:s.dropKey===dk?(s.swapReady?'0 0 0 2.5px #3D7BF2, 0 0 30px 10px rgba(61,123,242,.55)':DROPGLOW):(i===cu.idx?'0 0 0 1.5px #1A1A1A, 0 4px 10px rgba(26,26,26,.2)':'0 2px 6px rgba(26,26,26,.18)'),
  swap:s.dropKey===dk&&s.swapReady,drop:dk,anim:g.fresh?'beadpop .6s cubic-bezier(.34,1.8,.5,1)':'none',isB:!!g.isB,
  wordsLeft:x+3,wordsW:Math.max(10,w-6),words:g.words.map((wd,j)=>({w:wd.w,deco:wd.cut?'line-through':'none',op:wd.cut?.4:(i===cu.idx?1:.6),cursor:wd.filler?'pointer':'default',onClick:wd.filler?e=>{e.stopPropagation();self.toggleFiller(g.id,j)}:null})),
  hasKey:!!g.key,key:g.key||'',tickC:s.loop===g.id?'#1A1A1A':'#3D7BF2',tickGlow:s.loop===g.id?'0 0 14px 3px rgba(61,123,242,.9)':'0 0 10px 2px rgba(61,123,242,.6)',
  onTick:e=>{e.stopPropagation();if(s.loop===g.id){self.setState({loop:null,playing:false});return}const r=self.segRange(s,g.id);self.setState({loop:g.id,t:r.a+.02,playing:true},()=>self.play())},
  sat:!!g.broll,satBg:g.broll?(E.SC[g.broll.scene]||E.SC.bed).bg:'',
  labels:(s.labels['seg:'+g.id]||[]).map(t=>({t})),
  onDown:e=>{if(!edit)return;self.startGhostDrag(e,'bead',{w:56,h:56,r:'50%',bg:m.bg,tf:m.tf},k=>/^(clip|ghost|ighost):/.test(k),{segId:g.id})},
  onDbl:e=>self.openLabel(e,'seg:'+g.id),onCtx:e=>self.openMenu(e,'lens',s.active),
  onTrim:e=>{e.stopPropagation();self.trimPps=v.pps;self.drag={type:'trim',sx:e.clientX,sy:e.clientY,segId:g.id,dur0:g.dur,pps:v.pps}}};x+=w;gapsX.push(x);return o});
 const threadEnd=x;let plusG=null;if(s.threadX!=null){let bd2=1e9;gapsX.forEach((gx,i)=>{const dd=Math.abs(gx-s.threadX);if(dd<bd2){bd2=dd;plusG=i}});if(bd2>36)plusG=null}
 const dragging=!!self.drag&&!!s.ghost;
 const thread={len:threadEnd-TX,playX:TX+Math.min(s.t,v.total)*v.pps,
  plus:plusG!=null&&!s.plus&&!dragging&&edit,plusX:plusG!=null?gapsX[plusG]:0,
  onPlus:e=>{e.stopPropagation();self.setState({plus:{g:plusG}})},
  glyphs:!!s.plus&&edit,glyphX:s.plus?gapsX[s.plus.g]:0,
  onZoneMove:e=>{const w=self.s2w(e.clientX,e.clientY);if(Math.abs(w.x-(s.threadX||0))>3)self.setState({threadX:w.x})},onZoneLeave:()=>self.setState({threadX:null}),
  onZoneClick:e=>{const w=self.s2w(e.clientX,e.clientY);const t=clamp((w.x-TX)/v.pps,0,v.total);self.setState({t},()=>self.splitAt(t))},
  onZoneCtx:e=>{const w=self.s2w(e.clientX,e.clientY);let g=0,bd3=1e9;gapsX.forEach((gx,i)=>{if(Math.abs(gx-w.x)<bd3){bd3=Math.abs(gx-w.x);g=i}});self.openMenu(e,'gap',g)},
  gapZones:gapsX.map((gx,i)=>({x:gx-22,drop:'gap:'+i,shadow:s.dropKey==='gap:'+i?'0 0 0 2px rgba(61,123,242,.7), 0 0 26px 8px rgba(61,123,242,.45)':'none',op:s.dropKey==='gap:'+i?1:.0})),
  showGaps:dragging&&self.drag.type==='broll',
  snip:!!s.snip,snipX:s.snip?s.snip.x:0,time:fmt(s.t)+' / '+fmt(v.total),playIcon:!s.playing,pauseIcon:s.playing,onPlay:e=>{e.stopPropagation();self.togglePlay()},
  momentsOn:s.momentsOnly,momBg:s.momentsOnly?'#1A1A1A':'rgba(255,255,255,.55)',momColor:s.momentsOnly?'#fff':'#1A1A1A',onMoments:e=>{e.stopPropagation();self.setState({momentsOnly:!s.momentsOnly,t:0,loop:null})},
  onDrawer:e=>{e.stopPropagation();self.setState({drawer:!s.drawer})},
  endX:Math.max(threadEnd,TX+TW)+28};
 const G=g=>e=>self.glyph(g,s.plus?s.plus.g:0,e);
 thread.onVoice=G('voice');thread.onBroll=G('broll');thread.onGrade=G('grade');thread.onMusic=G('music');thread.onText=G('text');
 // voice + music lanes
 const vbars=[];c.voice.forEach(it=>it.bars.forEach((b,i)=>vbars.push({x:TX+it.t0*v.pps+i*4,h:Math.round(2+b*16)})));
 if(s.rec)s.rec.bars.forEach((b,i)=>vbars.push({x:TX+s.rec.t0*v.pps+i*4,h:Math.round(2+b*16)}));
 thread.vbars=vbars;thread.hasVoice=vbars.length>0;thread.voiceTags=c.voice.map(it=>({x:TX+it.t0*v.pps,t:it.voice+' · “'+it.text+'”'}));
 thread.music=!!c.music;thread.musicName=c.music?c.music.name+' · '+c.music.energy:'';
 if(c.music){const amp=c.music.energy==='high'?7:c.music.energy==='mid'?5:3;let d='';for(let px=0;px<=TW;px+=6){const t=px/v.pps;const duck=c.voice.some(it=>t>=it.t0-.2&&t<=it.t0+it.dur+.2);const y=12+(duck?6:0)-Math.sin(px/22)*amp*(duck?.25:1)*(.7+.3*Math.sin(px/90));d+=(px?' L':'M')+px+' '+y.toFixed(1)}thread.musicPath=d}else thread.musicPath='';
 thread.texts=c.texts.map(t=>({x:TX+t.t0*v.pps}));
 // takes
 const tks=s.takes.slice(0,4);const rots=[0,-3.5,3,-1.5];const tsc=self.cur(s).seg;const tm=self.media(tsc.scene,tsc.crop,c);
 const takes={count:s.takes.length,topName:s.takes[0]?s.takes[0].name:'',cards:tks.map((k,i)=>{let tf='translate3d('+(i*7)+'px,'+(i*-9)+'px,'+(-i*30)+'px) rotateZ('+rots[i]+'deg) rotateY('+(i*-5)+'deg)';let tr=s.takeSnap?'none':'transform .55s cubic-bezier(.34,1.56,.64,1), opacity .35s';let op=1;
  if(i===0&&s.takeDrag){const d=s.takeDrag;tf='translate3d('+d.dx+'px,'+d.dy+'px,40px) rotateZ('+(d.dx*.06)+'deg) rotateY('+(d.dx*.14)+'deg) rotateX('+(-d.dy*.06)+'deg)';tr='none'}
  if(i===0&&s.takeFly){const f=s.takeFly;tf='translate3d('+(f.dir*620)+'px,'+(f.dy-160)+'px,60px) rotateZ('+(f.dir*32)+'deg) rotateY('+(f.dir*48)+'deg)';tr='transform .38s cubic-bezier(.2,.7,.3,1), opacity .38s';op=0}
  if(s.takeSnap&&i===tks.length-1)op=0;
  return {id:k.id,tf,tr,op,z:10-i,bg:tm.bg,ctf:tm.tf,f:k.f||'none',onDown:i===0?e=>self.takeDown(e):stop,cursor:i===0?'grab':'default'}}).reverse()};
 // right panel
 const lensItem=(st,isMine)=>({id:st.id,name:st.name,bg:(E.SC[st.scene]||E.SC.bed).bg,f:st.f||'none',isDefault:!!st.isDefault,dur:12+st.name.length%6,ring:s.styleOn===st.id?'0 0 0 2px #3D7BF2, 0 6px 16px rgba(26,26,26,.18)':'0 1px 2px rgba(26,26,26,.14), 0 6px 16px rgba(26,26,26,.14)',anim:st.fresh?'beadpop .6s cubic-bezier(.34,1.8,.5,1)':'none',onClick:e=>{e.stopPropagation();self.applyStyle(st)},onCtx:e=>self.openMenu(e,'style',st)});
 const br=s.broll;const results=br?self.brollResults(br.query):[];
 const panel={styles:edit&&!br,broll:edit&&!!br,learn:s.learn,mine:s.myStyles.map(st=>lensItem(st,true)),recipes:s.recipes.map(st=>lensItem(st,false)),
  onLearn:e=>{e.stopPropagation();self.setState({learn:false});self.toast('Punch-ins tightened to 0.35s across this cut')},onLearnNo:e=>{e.stopPropagation();self.setState({learn:false})},
  query:br?br.query:'',onQuery:e=>{const q=e.target.value;self.setState(x=>({broll:Object.assign({},x.broll,{query:q,gen:'idle'})}))},onQueryKey:e=>{if(e.key==='Enter')e.target.blur()},
  chips:br?br.query.split(/,| and /).map(t=>t.trim()).filter(Boolean).map(t=>({t})):[],gapLabel:br?'inserting at gap '+(br.g+1):'',
  onAuto:e=>{e.stopPropagation();self.autoBroll()},onClose:e=>{e.stopPropagation();self.setState({broll:null})},
  results:results.map(r=>{const isGen=r.src==='generate';const genIdle=isGen&&br.gen==='idle',genBusy=isGen&&br.gen==='busy';const m=self.media(r.scene,r.crop,null);
   return {id:r.id,bg:m.bg,src:r.src,meta:r.meta,genIdle,genBusy,shim:genIdle||genBusy,ready:!genIdle&&!genBusy,dur:10+r.crop*2,
    onRender:e=>{e.stopPropagation();self.renderGen()},
    onDown:e=>{if(genIdle||genBusy){e.stopPropagation();return}self.startGhostDrag(e,'broll',{w:60,h:106,r:'10px',bg:m.bg,tf:m.tf},k=>/^(gap|bead|ghost|ighost):/.test(k),{item:r})}}})};
 // board
 const rows=[],cards=[],arrows=[];
 s.rows.forEach((row,ri)=>{const top=BY0+ri*ROWH;const n=row.cards.length;const rk='row:'+row.id;const rw=BX+n*(CW+GAP)-GAP+30-40;
  const pf=self.pillFor(rk);const dur=row.cards.reduce((a,k)=>a+(k.c?s.clips[k.c].segs.reduce((x,y)=>x+y.dur,0):parseFloat(k.ghost.len)||0),0);
  const kinds=new Set(row.cards.filter(k=>k.c).map(k=>s.clips[k.c].kind));
  rows.push({id:row.id,top:top+20,w:rw,h:CH+90,project:row.project,name:row.name,meta:n+' beats · '+fmt(dur)+(kinds.has('cam')&&kinds.has('gen')?' · camera + generated':'')+(row.template?' · from '+row.template:''),
   shadow:s.dropKey===rk?'0 0 0 2px rgba(61,123,242,.35), 0 0 60px 14px rgba(61,123,242,.22)':'none',drop:rk,pill:pf,ringW:rw+12,ringH:CH+102,
   onEnter:()=>self.setState({hover:rk}),onLeave:()=>self.setState({hover:null}),onCtx:e=>self.openMenu(e,'row',row.id)});
  row.cards.forEach((k,ci)=>{const cx=BX+ci*(CW+GAP),cy=top+60;
   if(ci<n-1)arrows.push({x:cx+CW+14,y:cy+CH/2,w:GAP-28});
   if(k.ghost){const gk='ghost:'+row.id+':'+ci;cards.push({key:gk,x:cx,y:cy,isClip:false,isGhost:true,op:1,p:k.ghost.p,len:k.ghost.len,busy:!!k.ghost.busy,notBusy:!k.ghost.busy,drop:gk,shadow:s.dropKey===gk?DROPGLOW:'inset 0 0 0 1px rgba(26,26,26,.08), inset 0 1px 0 rgba(255,255,255,.9)',onGen:e=>{e.stopPropagation();self.genGhost(row.id,ci)},onDown:stop,onDbl:stop,onCtx:e=>self.openMenu(e,'row',row.id),onEnter:null,onLeave:null,labels:[],pill:{show:false},ring:false});return}
   const cl=s.clips[k.c];const m=self.media(cl.segs[0]?cl.segs[0].scene:cl.scene,cl.segs[0]?cl.segs[0].crop:0,cl);const ck='clip:'+k.c;const pc=self.pillFor(ck);
   cards.push({key:k.c,x:cx,y:cy,isClip:true,isGhost:false,op:(bd&&k.c===s.active)?0:1,bg:m.bg,tf:m.tf,vid:m.vid,img:m.img,src:m.src,vidEl:m.vidEl,imgBg:m.imgBg,glowBg:m.glowBg,glowOp:.55*amb,toneBg:E.TONE[m.tone],toneOp:.7*amb,
    shadow:s.dropKey===ck?DROPGLOW:BASESH,name:cl.name,mark:cl.kind==='gen'?'gen':cl.kind==='screen'?'screen':'cam',markShow:marks,drop:ck,pill:pc,ring:pc.ring,
    labels:(s.labels[ck]||[]).map((t,i)=>({t,rot:(i%2?2:-3)+'deg'})),
    onDown:e=>self.startGhostDrag(e,'card',{w:72,h:128,r:'10px',bg:m.bg,tf:m.tf},kk=>/^(row|ghost|ighost):/.test(kk),{cid:k.c,rid:row.id,ci}),
    onDbl:e=>self.openLabel(e,ck),onCtx:e=>self.openMenu(e,'card',k.c),onEnter:()=>self.setState({hover:ck}),onLeave:()=>self.setState({hover:null})})})});
 let ins={show:false,x:0,y:0};if(s.dropKey&&s.dropKey.startsWith('row:')&&s.ghost){const ri=s.rows.findIndex(r=>r.id===s.dropKey.slice(4));const gw=self.s2w(s.ghost.x+s.ghost.w/2,0);const n=s.rows[ri].cards.length;const idx=clamp(Math.round((gw.x-BX-CW/2)/(CW+GAP)+.5),0,n);ins={show:true,x:BX+idx*(CW+GAP)-GAP/2-1.5,y:BY0+ri*ROWH+50}}
 const tagMap={};s.rows.forEach(r=>r.cards.forEach(k=>{if(!k.c)return;(s.labels['clip:'+k.c]||[]).filter(l=>l[0]==='#').forEach(l=>{(tagMap[l]=tagMap[l]||[]).push(k.c)})}));
 const groups=Object.keys(tagMap).map((tag,gi)=>({tag,y:BY0+40+gi*250,count:tagMap[tag].length+' cards',cards:tagMap[tag].map((cid,j)=>{const cl=s.clips[cid];const m=self.media(cl.segs[0]?cl.segs[0].scene:cl.scene,cl.segs[0]?cl.segs[0].crop:0,cl);return {key:cid+tag,x:j*72,bg:m.bg,tf:m.tf,onClick:e=>{e.stopPropagation();self.openClip(cid)}}})}));
 const tplY=BY0+s.rows.length*ROWH+30;
 const board={rows,cards,arrows,ins,groups,tplY,tplTitleY:tplY,templates:s.templates.map((t,i)=>({name:t.name,x:60+i*300,y:tplY+50,mine:!!t.mine,beats:t.beats.map(b=>({p:b[0],len:b[1]})),onClick:e=>{e.stopPropagation();self.addTemplate(t)}}))};
 // free lenses
 const free=s.free.map(f=>{const cl=s.clips[f.clip];const g0=cl.segs[0];const m=self.media(g0?g0.scene:cl.scene,g0?g0.crop:0,cl);const ck='clip:'+f.clip;const pf=self.pillFor(ck);
  return {id:f.id,x:f.x,y:f.y,w:f.w,h:f.h,op:(bd&&f.clip===s.active)||(f.clip===s.active&&!bd&&false)?0:1,bg:m.bg,tf:m.tf,vid:m.vid,img:m.img,src:m.src,vidEl:m.vidEl,imgBg:m.imgBg,glowBg:m.glowBg,toneBg:E.TONE[m.tone],glowOp:.6*amb,
   shadow:s.dropKey===ck?DROPGLOW:BASESH,drop:ck,name:cl.name,summary:cl.analysing?cl.analysing:(cl.summary||cl.segs.length+' beats'),analysing:!!cl.analysing,mark:cl.kind==='gen'?'gen':cl.kind==='screen'?'screen':'cam',markShow:marks,pill:pf,ringW:f.w+12,ringH:f.h+12,
   anim:f.fresh?'rise .6s cubic-bezier(.34,1.5,.5,1) both':'none',labels:(s.labels[ck]||[]).map((t,i)=>({t,rot:(i%2?2:-3)+'deg'})),
   onDown:e=>{e.stopPropagation();self.drag={type:'free',sx:e.clientX,sy:e.clientY,fid:f.id,ox:f.x,oy:f.y,clip:f.clip}},onDbl:e=>self.openLabel(e,ck),onCtx:e=>self.openMenu(e,'card',f.clip),onEnter:()=>self.setState({hover:ck}),onLeave:()=>self.setState({hover:null})}});
 // idea
 const filled=s.ideaBeats.filter(b=>b.fill).length;const score=Math.min(96,54+(s.angle!=null?8:0)+filled*7+(s.ideaBeats[0].fill?4:0));
 const idea={text:s.idea,top:s.ideaStage?80:330,s1:s.ideaStage>=1,s2:s.ideaStage>=2,s3:s.ideaStage>=3,s4:s.ideaStage>=4,
  onChange:e=>{self.userTyped=true;self.setState({idea:e.target.value})},onKey:e=>{if(e.key==='Enter'){self.userTyped=true;self.submitIdea()}},onFocus:()=>{self.userTyped=true;clearInterval(self.ti)},
  onSubmit:e=>{e.stopPropagation();self.userTyped=true;self.submitIdea()},onMic:e=>{e.stopPropagation();self.userTyped=false;self.setState({idea:'',ideaStage:0});self.autoIdea()},
  angles:E.ANGLES.map((a,i)=>({t:a.t,r:a.r,x:340+i*300,shadow:s.angle===i?'0 0 0 2px #3D7BF2, 0 10px 30px rgba(61,123,242,.25)':'0 1px 2px rgba(26,26,26,.1), 0 10px 30px rgba(26,26,26,.08)',pick:s.angle===i?'Using this angle':'Use this angle',onClick:e=>{e.stopPropagation();self.setState({angle:s.angle===i?null:i});self.toast(s.angle===i?'Angle cleared':'Angle adopted · beat sheet re-scored')}})),
  score,scoreOff:100-score,ideaText:s.idea||'—',filledLabel:filled+' / 5 beats filled',
  onGenAll:e=>{e.stopPropagation();s.ideaBeats.forEach((b,i)=>self.genIdea(i))},
  beats:s.ideaBeats.map((b,i)=>{const dk='ighost:'+i;const cl=b.fill?s.clips[b.fill]:null;const m=cl?self.media(cl.segs[0].scene,cl.segs[0].crop,cl):{};return {p:b.p,d:i===0&&s.angle!=null?E.ANGLES[s.angle].t:b.d,len:b.len,x:360+i*210,ghost:!b.fill&&!b.busy,busy:b.busy,filled:!!b.fill,bg:m.bg||'',tf:m.tf||'',vid:!!m.vid,img:!!m.img,src:m.src||'',vidEl:m.vidEl||null,imgBg:m.imgBg||'none',drop:dk,shadow:s.dropKey===dk?DROPGLOW:(b.fill?BASESH:'inset 0 0 0 1px rgba(26,26,26,.08), inset 0 1px 0 rgba(255,255,255,.9)'),onGen:e=>{e.stopPropagation();self.genIdea(i)},hasRisk:!!b.risk&&!b.fill,risk:b.risk||'',mark:cl?(cl.kind==='gen'?'gen':'cam'):'',onOpen:e=>{e.stopPropagation();if(b.fill)self.openClip(b.fill)}}})};
 // overlay
 const menu={show:!!s.menu};if(s.menu){const m=s.menu;const items=m.saving?[]:self.menuItems(m);const w=m.saving?330:268;const h=m.saving?460:items.length*42+14;Object.assign(menu,{x:clamp(m.x,12,s.vw-w-12),y:clamp(m.y,12,s.vh-h-12),w,list:!m.saving,saving:m.saving,items,name:m.name,caps:self.captures().map(q=>({k:q[0],v:q[1]})),def:m.def,defLabel:'Set as '+self.projectOf(s.active)+' default',defBg:m.def?'#1A1A1A':'rgba(26,26,26,.12)',defKnob:m.def?'18px':'2px',
  onName:e=>{const val=e.target.value;self.setState(x=>({menu:Object.assign({},x.menu,{name:val})}))},onNameKey:e=>{if(e.key==='Enter')self.saveStyle()},onDef:e=>{e.stopPropagation();self.setState(x=>({menu:Object.assign({},x.menu,{def:!x.menu.def})}))},onSave:e=>{e.stopPropagation();self.saveStyle()},onCancel:e=>{e.stopPropagation();self.setState({menu:null})}})}
 const pop={show:!!s.pop&&edit};if(s.pop){const w=340,h=s.pop.kind==='grade'?330:s.pop.kind==='voice'?300:230;const pc=self.cur(s).seg;const pm=self.media(pc.scene,pc.crop,c);Object.assign(pop,{x:clamp(s.pop.x-w/2,12,s.vw-w-12),y:clamp(s.pop.y+24,12,s.vh-h-12),voice:s.pop.kind==='voice',grade:s.pop.kind==='grade',music:s.pop.kind==='music',
  recLabel:s.rec?'Stop · '+fmt(s.rec.bars.length*.07):'Record',recBg:s.rec?'#E0483E':'#1A1A1A',onRec:e=>{e.stopPropagation();self.recToggle()},recBars:(s.rec?s.rec.bars:[]).map(b=>({h:Math.round(3+b*26)})),recording:!!s.rec,
  line:s.voiceLine,onLine:e=>self.setState({voiceLine:e.target.value}),onLineKey:e=>{if(e.key==='Enter')self.typedVoice()},
  voices:E.VOICES.map(n=>({n,bg:s.voiceSel===n?'#1A1A1A':'rgba(255,255,255,.6)',color:s.voiceSel===n?'#fff':'#1A1A1A',onClick:e=>{e.stopPropagation();self.setState({voiceSel:n})}})),
  swatches:E.GRADES.map(g=>({name:g.name,bg:pm.bg,tf:pm.tf,f:g.filter,tint:g.tint,ring:c.grade&&c.grade.name===g.name?'0 0 0 2px #3D7BF2':'0 1px 2px rgba(26,26,26,.2)',onClick:e=>{e.stopPropagation();self.upClip(s.active,{grade:g});self.toast('Graded · '+g.name)}})),
  refs:E.REFS.map((r,i)=>({name:r.name,bg:E.SC[r.scene].bg,tf:E.CROPS[r.crop],rot:[-6,4,-2][i]+'deg',onDown:e=>self.startGhostDrag(e,'ref',{w:84,h:96,r:'4px',bg:E.SC[r.scene].bg,tf:E.CROPS[r.crop]},k=>k.startsWith('clip:'),{ref:r})})),
  tracks:E.TRACKS.map(t=>({name:t.name,energy:t.energy,bars:[0,1,2,3,4,5,6].map(i=>({h:Math.round(4+(t.energy==='high'?14:t.energy==='mid'?9:5)*Math.abs(Math.sin(i*1.3+t.name.length)))})),bg:c.music&&c.music.name===t.name?'rgba(255,255,255,.75)':'rgba(0,0,0,0)',onClick:e=>{e.stopPropagation();self.upClip(s.active,{music:t});self.setState({pop:null});self.toast('Music · '+t.name+(c.voice.length?' · ducks under voice':''))}}))})}
 const le=s.labelEdit;const labelEdit={show:!!le,x:le?clamp(le.x-20,12,s.vw-260):0,y:le?clamp(le.y-22,12,s.vh-60):0,val:le?le.val:'',onChange:e=>{const val=e.target.value;self.setState(x=>({labelEdit:Object.assign({},x.labelEdit,{val})}))},onKey:e=>{if(e.key==='Enter')self.commitLabel();if(e.key==='Escape')self.setState({labelEdit:null})},onBlur:()=>self.commitLabel()};
 const gh=s.ghost;const ghost={show:!!gh,x:gh?gh.x:0,y:gh?gh.y:0,w:gh?gh.w:0,h:gh?gh.h:0,r:gh?gh.r:'0',bg:gh?gh.bg:'',tf:gh?gh.tf:''};
 const fd=s.fileDrag;const fileGlow={show:!!fd,bg:fd?'radial-gradient(circle 220px at '+fd.x+'px '+fd.y+'px, rgba(61,123,242,.2), rgba(61,123,242,0))':'none',x:fd?clamp(fd.x+20,12,s.vw-300):0,y:fd?clamp(fd.y+20,12,s.vh-60):0,label:s.dropKey&&s.dropKey.startsWith('clip:')?'Drop an image to grade this Lens · a clip to add':s.dropKey?'Drop to fill this beat':'Drop to add as a Lens · folders work too'};
 const navItem=(k,l)=>({label:l,bg:mode===k?'#1A1A1A':'rgba(0,0,0,0)',color:mode===k?'#fff':'#1A1A1A',onClick:e=>{e.stopPropagation();self.go(k)}});
 const hud={ad:(s.rows.find(r=>r.cards.some(k=>k.c===s.active))||{name:c.name}).name,project:self.projectOf(s.active),clipName:c.name,
  nav:[navItem('idea','Idea'),navItem('board','Board'),navItem('edit','Edit'),navItem('theater','Theater')],zoom:Math.round(z*100)+'%',
  hint:edit?'Hold Space to talk · S split · B b-roll · M moments · T timeline':bd?'Click a card to fly in · drag to re-sequence · double-click to label':th?'Zoom out or Esc to edit':'Drop clips anywhere · zoom out for the storyboard',
  toast:!!s.toast,toastText:s.toast||''};
 const tTotal=v.total;const pct=t=>(t/tTotal*100);let a2=0;
 const drawer={open:s.drawer,tf:s.drawer?'translateY(0)':'translateY(110%)',vid:v.segs.map(g=>{const o={l:pct(a2),w:pct(g.dur),bg:(E.SC[g.scene]||E.SC.bed).bg,label:g.words.filter(w=>!w.cut).map(w=>w.w).join(' ')||'b-roll'};a2+=g.dur;return o}),
  bro:(()=>{let a=0;return v.segs.map(g=>{const o={show:!!g.broll,l:pct(a+g.dur*.3),w:pct(g.dur*.45),bg:g.broll?(E.SC[g.broll.scene]||E.SC.bed).bg:''};a+=g.dur;return o}).filter(o=>o.show)})(),
  voi:c.voice.map(it=>({l:pct(it.t0),w:pct(it.dur),label:it.voice})),mus:!!c.music,musLabel:c.music?c.music.name:'',
  caps:(()=>{let a=0;return v.segs.map(g=>{const o={l:pct(a),w:pct(g.dur),label:g.words.filter(w=>!w.cut).map(w=>w.w).join(' ')};a+=g.dur;return o}).filter(o=>o.label)})(),
  ph:pct(Math.min(s.t,tTotal)),time:fmt(s.t)+' / '+fmt(tTotal),onClose:e=>{e.stopPropagation();self.setState({drawer:false})},
  onSeek:e=>{const r=e.currentTarget.getBoundingClientRect();self.setState({t:clamp((e.clientX-r.left)/r.width,0,1)*tTotal})}};
 const theater={show:th,y:THEATER.y+THEATER.h+34,title:hud.ad+' · '+c.name,time:fmt(s.t)+' / '+fmt(v.total),onPlay:e=>{e.stopPropagation();self.togglePlay()},playIcon:!s.playing,pauseIcon:s.playing};
 return {ready:true,rootRef:self.rootRef,heroInner:self.heroInner,stop,hair,inv,fs15,fs12,cav,grain,
  worldTf:'translate('+s.cam.x+'px,'+s.cam.y+'px) scale('+z+')',worldTr:s.camAnim?'transform .95s cubic-bezier(.22,1,.36,1)':'none',
  rootCursor:self.drag&&self.drag.type==='pan'&&self.drag.moved?'grabbing':'default',
  onRootDown:e=>{const t=e.target;const st=self.state;const up={};if(st.menu&&!t.closest('[data-menu]'))up.menu=null;if((st.plus||st.pop)&&!t.closest('[data-pop]')){up.plus=null;if(!st.rec)up.pop=null}if(st.cap.edit&&!t.closest('input'))null;if(Object.keys(up).length)self.setState(up);if(e.button!==0||t.closest('[data-nopan]')||t.closest('input'))return;self.drag={type:'pan',sx:e.clientX,sy:e.clientY,cx:st.cam.x,cy:st.cam.y}},
  onRootCtx:e=>e.preventDefault(),onDragOver:e=>self.onDragOver(e),onDragLeave:e=>self.onDragLeave(e),onDrop:e=>self.onDrop(e),
  ez:{op:edit?1:0,pe:edit?'auto':'none'},hero,talk,cap:capObj,beads,thread,takes,panel,board,free,idea,menu,pop,labelEdit,ghost,fileGlow,hud,drawer,theater,
  loop:{show:!!s.loop&&edit,tag:s.loop?((v.segs.find(g=>g.id===s.loop)||{}).key||''):'',onExit:e=>{e.stopPropagation();self.setState({loop:null,playing:false})}},
  activeDrop:'clip:'+s.active,clipMeta:hud.project+' · '+hud.ad,clipKind:c.kind==='gen'?'gen':c.kind==='screen'?'screen':'cam',showMarks:marks};
}
window.EYE.App={M,render,initState};
})();
