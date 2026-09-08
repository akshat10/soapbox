import type { VehicleSnapshot } from './types';
export function localTip(s:VehicleSnapshot|undefined):string {
 if(!s)return 'Try a short hop on the first bumps. Save a bigger charge for the jump.';
 if(s.recoveries>0||s.flips>0)return `You needed ${s.recoveries} ${s.recoveries===1?'recovery':'recoveries'}. Try a lower body or a longer wheelbase, then test a gentler hop.`;
 if(s.jumps===0)return 'You coasted this heat. Try charging before the striped ramp and release while your wheels are still down.';
 if(s.finished)return `You finished with ${s.jumps} hops. Try a shorter charge over the small bumps and keep the bigger launch for the final ramp.`;
 return 'Try releasing just before a ramp. Charging in the air cannot prepare your next hop.';
}
