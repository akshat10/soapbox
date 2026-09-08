import * as THREE from 'three';
import { BAY_CIRCUIT_COURSE, BAY_OR_BUST_COURSE } from './course';
import { RETURN_START } from './course-circuit';
import { createReturnRoadFoundation } from './course-terrain';

/** The viaduct is drawn directly from the collider triangles. No visual-only
 * ramps, jumps or barriers: every raised edge has matching road collision. */
export function createCircuitScene(): THREE.Group {
  const root = new THREE.Group(); root.name = 'Skyline Run · circuit return';
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x354657, roughness: .92, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ color: 0xffd452, roughness: .75, side: THREE.DoubleSide });
  const structural = new THREE.MeshStandardMaterial({ color: 0x78949e, roughness: .8 });
  root.add(createReturnRoadFoundation());
  const startTriangle = (BAY_OR_BUST_COURSE.paths[0].samples.length-1)*10;
  const triangles = BAY_CIRCUIT_COURSE.roadTriangles().slice(startTriangle);
  for (const edges of [false,true]) {
    const positions: number[] = [];
    triangles.forEach((triangle,i) => { if ((i%10>=2)===edges) triangle.points.forEach(p=>positions.push(p.x,p.y,p.z)); });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry,edges?curb:asphalt); mesh.receiveShadow = true; root.add(mesh);
  }
  // Under-deck beams and support piers make the climb read as a coastal road.
  const beamGeometry = new THREE.BoxGeometry(15.5,.4,1);
  const columnGeometry = new THREE.CylinderGeometry(.55,.85,1,8);
  for(let distance=RETURN_START+5;distance<BAY_CIRCUIT_COURSE.finishDistance-9;distance+=18) {
    const frame=BAY_CIRCUIT_COURSE.frame(distance);
    const beam=new THREE.Mesh(beamGeometry,structural);
    const q=BAY_CIRCUIT_COURSE.orientation(frame);beam.quaternion.set(q.x,q.y,q.z,q.w);
    beam.position.set(frame.position.x,frame.position.y-.65,frame.position.z);root.add(beam);
    for(const side of [-1,1]) {
      const foot=frame.position.vadd(frame.right.scale(side*5.5));
      const column=new THREE.Mesh(columnGeometry,structural);
      const height=foot.y+4;column.scale.y=height;column.position.set(foot.x,foot.y-height/2-.6,foot.z);root.add(column);
    }
  }
  // Dashed centre marks convey speed along the long climbing straight.
  const markGeometry=new THREE.PlaneGeometry(.16,2.8);
  const markMaterial=new THREE.MeshBasicMaterial({color:0xdcebee,side:THREE.DoubleSide});
  for(let distance=RETURN_START+3;distance<BAY_CIRCUIT_COURSE.finishDistance-4;distance+=7) {
    const frame=BAY_CIRCUIT_COURSE.frame(distance);const mark=new THREE.Mesh(markGeometry,markMaterial);
    const basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...frame.right.toArray()),new THREE.Vector3(...frame.tangent.toArray()).negate(),new THREE.Vector3(...frame.up.toArray()));
    mark.quaternion.setFromRotationMatrix(basis);mark.position.set(frame.position.x,frame.position.y+.025,frame.position.z);root.add(mark);
  }
  return root;
}
