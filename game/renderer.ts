import * as THREE from 'three';
import { createVehicleModel, createWheelModel, createTrackScene } from './visuals';
import { getBody, getWheel } from './catalogue';
import { groundHeight } from './track';
import type { Blueprint, Stage, VehicleSnapshot } from './types';

const COLORS=[0x3761ff,0xff6656];
type Car={chassis:THREE.Group;wheels:THREE.Group[];shadow:THREE.Mesh};
export class DerbyRenderer {
 renderer:THREE.WebGLRenderer;
 scene=new THREE.Scene(); showroom=new THREE.Scene();
 cameras=[new THREE.PerspectiveCamera(54,1,.1,500),new THREE.PerspectiveCamera(54,1,.1,500)];
 showroomCamera=new THREE.PerspectiveCamera(35,1,.1,200);
 cars:Car[]=[]; previewCars:THREE.Group[]=[];
 parent:HTMLElement; width=1;height=1;
 resizeObserver:ResizeObserver;
 constructor(parent:HTMLElement){
  this.parent=parent;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  parent.appendChild(this.renderer.domElement);
  this.scene.background=new THREE.Color(0xade2ef);this.scene.fog=new THREE.Fog(0xade2ef,70,190);
  this.showroom.background=new THREE.Color(0xafdcd9);
  for(const scene of [this.scene,this.showroom]){
   scene.add(new THREE.HemisphereLight(0xfffbdd,0x4b7a67,2.5));
   const light=new THREE.DirectionalLight(0xfff3d6,3);light.position.set(-20,50,-25);light.castShadow=true;
   light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-35;light.shadow.camera.right=35;light.shadow.camera.top=40;light.shadow.camera.bottom=-35;light.shadow.camera.far=130;light.shadow.bias=-.0007;
   scene.add(light);scene.add(light.target);
  }
  this.scene.add(createTrackScene());
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xafdcd9,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.3;floor.receiveShadow=true;this.showroom.add(floor);
  for(let i=0;i<2;i++){
   const plinth=new THREE.Mesh(new THREE.CylinderGeometry(2.75,2.9,.35,48),new THREE.MeshStandardMaterial({color:i===0?0x587afa:0xfa826d,roughness:.7}));plinth.position.set(i===0?-2:2,-.08,i===0?-1.2:1.2);plinth.receiveShadow=true;this.showroom.add(plinth);
  }
  this.showroomCamera.position.set(-13,13,22);this.showroomCamera.lookAt(0,.8,0);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(parent);this.resize();
 }
 resize(){this.width=Math.max(1,this.parent.clientWidth);this.height=Math.max(1,this.parent.clientHeight);this.renderer.setSize(this.width,this.height,false);this.showroomCamera.aspect=this.width/this.height;this.showroomCamera.updateProjectionMatrix();}
 setBuilds(builds:Blueprint[]){
  for(const car of this.cars){this.scene.remove(car.chassis,car.shadow,...car.wheels);this.disposeObjects([car.chassis,car.shadow,...car.wheels]);}
  for(const car of this.previewCars){this.showroom.remove(car);this.disposeObjects([car]);}
  this.cars=[];this.previewCars=[];
  builds.forEach((build,i)=>{
   const chassis=createVehicleModel(build,COLORS[i]);const wheels=Array.from({length:4},()=>createWheelModel(build,COLORS[i]));
   const shadow=new THREE.Mesh(new THREE.CircleGeometry(1.7,24),new THREE.MeshBasicMaterial({color:0x101b20,transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;
   this.scene.add(chassis,shadow,...wheels);this.cars.push({chassis,wheels,shadow});
   const preview=new THREE.Group();const body=getBody(build.bodyId),wheel=getWheel(build.wheelId);
   const model=createVehicleModel(build,COLORS[i]);model.position.y=body.height/2+wheel.radius*.95+.12;preview.add(model);
   const factor={short:.62,standard:.7,long:.9}[build.wheelbase];
   for(const x of [-1,1])for(const z of [-1,1]){const w=createWheelModel(build,COLORS[i]);w.position.set(x*(body.width/2+.13),wheel.radius+.16,z*body.length*factor/2);preview.add(w);}
   preview.position.set(i===0?-2:2,0,i===0?-1.2:1.2);preview.rotation.y=i===0?-.15:.12;this.showroom.add(preview);this.previewCars.push(preview);
  });
 }
 render(stage:Stage,snapshots:VehicleSnapshot[],dt:number,time:number){
  if(stage==='garage'){
   this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,this.width,this.height);
   this.previewCars.forEach((c,i)=>c.rotation.y=(i===0?-.15:.12)+Math.sin(time*.25)*.13);
   this.renderer.render(this.showroom,this.showroomCamera);return;
  }
  for(const s of snapshots){const car=this.cars[s.id];if(!car)continue;
   car.chassis.position.copy(s.position);car.chassis.quaternion.copy(s.quaternion);car.chassis.scale.y=1-s.charge*.075;
   s.wheels.forEach((w,i)=>{if(car.wheels[i]){car.wheels[i].position.copy(w.position);car.wheels[i].quaternion.copy(w.quaternion);}});
   car.chassis.visible=!s.recovering||Math.floor(time*7)%2===0;
   car.shadow.position.set(s.position.x,groundHeight(s.position.z)+.06,s.position.z);car.shadow.scale.set(1,1.55,1);
   const c=this.cameras[s.id];const target=new THREE.Vector3(s.position.x+7.1,s.position.y+7.5,s.position.z-12);
   if(c.position.lengthSq()<1)c.position.copy(target);else c.position.lerp(target,Math.min(1,dt*6));
   c.lookAt(s.position.x,Math.max(s.position.y,groundHeight(s.position.z))+.45,s.position.z+9);
  }
  this.renderer.setScissorTest(true);const sideBySide=this.width>780;
  for(let i=0;i<2;i++){
   const w=sideBySide?Math.floor(this.width/2):this.width,h=sideBySide?this.height:Math.floor(this.height/2);
   const x=sideBySide?i*w:0,y=sideBySide?0:(1-i)*h;const c=this.cameras[i];c.aspect=w/h;c.updateProjectionMatrix();
   this.renderer.setViewport(x,y,w,h);this.renderer.setScissor(x,y,w,h);this.renderer.render(this.scene,c);
  }
 }
 disposeObjects(objects:THREE.Object3D[]){for(const o of objects)o.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();const mats=Array.isArray(node.material)?node.material:[node.material];mats.forEach(m=>m.dispose());}});}
 dispose(){this.resizeObserver.disconnect();this.disposeObjects([this.scene,this.showroom]);this.renderer.dispose();this.renderer.domElement.remove();}
}
