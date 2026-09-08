import type { TrackPiece } from './types';
export const START_Z = 0;
export const FINISH_Z = 260;
export const LANE_CENTERS = [-3.5, 3.5];
export const CHECKPOINT_ZS = [0, 30, 70, 110, 175, 220];
export const COURSE_MARKERS = [
 {z:32,name:'LOMBARD STREET',color:0xffdc42},
 {z:79,name:'GOLDEN GATE GAP',color:0xff715a},
 {z:143,name:'WONKY LANDING',color:0xa7edb3},
 {z:221,name:'TO THE BAY!',color:0xffdc42},
];
const base = (z:number) => 15 - z * 0.072;
const elevations: [number,number][] = [[-20,0],[32,0],[37,.48],[41,0],[46,.65],[51,0],[56,.48],[61,0],[78,0],[87,1.35],[94,0],[139,0],[148,.65],[157,.65],[165,0],[221,0],[232,2.1],[241,0],[285,0]];
export function groundHeight(z:number) {
 if(z>87 && z<94) return base(z)-1.6;
 for(let i=1;i<elevations.length;i++) {const [a,h]=elevations[i-1]; const [b,k]=elevations[i]; if(z<=b)return base(z)+h+(k-h)*Math.max(0,(z-a)/(b-a));}
 return base(z);
}
const pieces:TrackPiece[]=[];
function ramp(id:string,z0:number,z1:number,h0:number,h1:number,width=14,x=0,roll=0,color=0x3e4859) {
 const y0=base(z0)+h0,y1=base(z1)+h1, dz=z1-z0,dy=y1-y0;
 pieces.push({id,name:id,position:[x,(y0+y1)/2-.3,(z0+z1)/2],size:[width,.6,Math.sqrt(dz*dz+dy*dy)+.06],rotation:[Math.atan2(-dy,dz),0,roll],color});
}
for(let i=1;i<elevations.length;i++) {
 const [a,h]=elevations[i-1], [b,k]=elevations[i];
 if(a===87 && b===94) {ramp('trench-floor',a,b,-1.6,-1.6); continue;}
 if(a===148 && b===157){ for(const [i,x] of LANE_CENTERS.entries())ramp('wonky-'+i,a,b,h,k,6.7,x,.045,0x66765a); }
 else ramp('road-'+i,a,b,h,k,14,0,0,h>0||k>0?0xb37d48:0x3e4859);
}
// Low continuous edge rails contain ordinary wheel drift without altering forward speed.
for (const x of [-7.15,7.15])ramp('edge-'+x,-20,285,.28,.28,.3,x,0,0xd5ad62);
export const TRACK_PIECES=pieces;
