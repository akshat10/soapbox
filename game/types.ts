export type PlayerId = 0 | 1 | 2 | 3;
export type WheelId = 'casters' | 'standard' | 'monster' | 'skate' | 'scooter' | 'transit_disc';
export type Wheelbase = 'short' | 'standard' | 'long';
export type Stage = 'garage' | 'countdown' | 'racing' | 'results' | 'final';
export interface Blueprint { bodyId: string; wheelId: WheelId; wheelbase: Wheelbase }
export interface BodyDef { id: string; name: string; family: string; description: string; cost: number; mass: number; width: number; height: number; length: number; color: number; comHeight: number; driverSeat?: [number, number, number] }
export interface WheelDef { id: WheelId; name: string; radius: number; mass: number; cost: number; grip: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }
export interface Pose { position: Vec3; quaternion: Quat }
export interface VehicleSnapshot extends Pose { id: PlayerId; wheels: Pose[]; speed: number; progress: number; charge: number; grounded: boolean; recovering: boolean; finished: boolean; finishTime: number | null; flips: number; recoveries: number; jumps: number; maxRoll: number; blueprint: Blueprint; courseId?: 'bay-or-bust'; pathId?: string; pathDistance?: number }
export interface TrackPiece { id: string; name: string; position: [number,number,number]; size: [number,number,number]; rotation: [number,number,number]; color: number }
